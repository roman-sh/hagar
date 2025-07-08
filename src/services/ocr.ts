import { DocumentAnalysisClient, AzureKeyCredential, AnalyzeResult } from '@azure/ai-form-recognizer'
import { openai } from '../connections/openai'
import reviewPrompt from '../prompts/ocr-review.txt'
import { AUX_MODEL } from '../config/settings'
import { finalizeOcrExtraction } from '../tools/finalize-ocr-extraction'

// Load environment variables
const endpoint = process.env.FORM_RECOGNIZER_ENDPOINT
const apiKey = process.env.FORM_RECOGNIZER_API_KEY

// Initialize the client once
const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey))

// --- Type Definitions ---

export interface TableData {
   table: number
   page: number
   header: string[]
   rows: string[][]
}

export interface OcrReviewResult {
   data: TableData[]
   annotation: string
}

// --- Helper Functions ---

const sanitize = (text: string) => {
   if (!text) return ''
   return text
      .replace(/\n/g, ' ')
      .replace(/:selected:/g, '')
      .replace(/:unselected:/g, '')
      .replace(/\s+/g, ' ')
      .replace(/"/g, '״')
      .trim()
}

/**
 * Extracts structured data from an Azure Document Intelligence analysis result.
 * It assumes one table per page and formats the output into a simple list
 * of page objects, each containing its rows. This format is ideal for GPT processing.
 * @param {AnalyzeResult} analysisResult - The raw result from the Azure service.
 * @returns {TableData[]} An array of page data objects.
 */
const extractPageData = (analysisResult: AnalyzeResult): TableData[] => {
   if (!analysisResult.tables?.length) return []

   const tablesData: TableData[] = []

   for (const [tableIndex, table] of analysisResult.tables.entries()) {
      const newTable: TableData = {
         table: tableIndex + 1,
         page: table.boundingRegions[0].pageNumber,
         header: new Array(table.columnCount).fill(''),
         rows: [],
      }

      // Populate header and rows from cells
      for (const cell of table.cells) {
         if (cell.kind === 'columnHeader') {
            newTable.header[cell.columnIndex] = sanitize(cell.content)
         } else if (cell.kind === 'content') {
            // Ensure the row exists
            if (!newTable.rows[cell.rowIndex]) {
               newTable.rows[cell.rowIndex] = new Array(table.columnCount).fill('')
            }
            newTable.rows[cell.rowIndex][cell.columnIndex] = sanitize(cell.content)
         }
      }

      // Filter out empty rows that were created for headers
      newTable.rows = newTable.rows.filter(row => row)

      if (newTable.rows.length) {
         tablesData.push(newTable)
      }
   }

   return tablesData
}


// --- Main Service Object ---

export const ocr = {
   /**
    * Analyzes an invoice from a public URL and extracts a list of page data.
    * @param {string} url - The public URL of the document to analyze.
    * @returns {Promise<TableData[]>} The extracted data as an array of page objects.
    */
   async extractInvoiceDataFromUrl(url: string): Promise<TableData[]> {
      try {
         log.info(`Analyzing document from URL: ${url}`)

         const poller = await client.beginAnalyzeDocumentFromUrl("prebuilt-invoice", url, {
            locale: "he",
            features: ["ocrHighResolution"],
         })

         const result = await poller.pollUntilDone()

         log.info('Extracting structured data...')
         const extractedData = extractPageData(result)

         return extractedData
      } catch (error) {
         log.error(error, 'Error analyzing document from URL:')
         throw error
      }
   },

   /**
    * Reviews and corrects OCR data using a powerful reasoning model.
    * @param {TableData[]} extractedData - The raw data extracted by Azure OCR.
    * @returns {Promise<OcrReviewResult>} An object containing the corrected data and a natural language annotation.
    */
   async review(extractedData: TableData[]): Promise<OcrReviewResult> {
      try {
         log.info('Reviewing and correcting OCR data with o3 model...')

         const response = await openai.chat.completions.create({
            model: AUX_MODEL,
            messages: [
               { role: 'system', content: reviewPrompt },
               { role: 'user', content: JSON.stringify(extractedData, null, 2) }
            ],
            response_format: { type: 'json_object' },
         })

         const result = JSON.parse(response.choices[0].message.content)

         log.info({ annotation: result.annotation }, 'OCR data review complete.')
         
         return result

      } catch (error) {
         log.error(error, 'Error reviewing OCR data:')
         throw error
      }
   }
} 