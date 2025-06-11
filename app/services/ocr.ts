import { DocumentAnalysisClient, AzureKeyCredential, AnalyzeResult } from '@azure/ai-form-recognizer'

// Load environment variables
const endpoint = process.env.FORM_RECOGNIZER_ENDPOINT
const apiKey = process.env.FORM_RECOGNIZER_API_KEY

// Initialize the client once
const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(apiKey))

// --- Type Definitions ---

export interface PageData {
   page: number
   rows: string[][]
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
 * @returns {PageData[]} An array of page data objects.
 * [
 *    {
 *       "page": 1,
 *       "rows": [
 *          ["#", "תיאור", "כמות"],
 *          ["1", "תפוח עץ גאלה אורגני", "15"]
 *       ]
 *    },
 *    {
 *       "page": 2,
 *       "rows": [
 *          ["50", "שוקולד מריר 70% אורגני", "25"]
 *       ]
 *    }
 * ]
 */
const extractPageData = (analysisResult: AnalyzeResult): PageData[] => {
   if (!analysisResult.tables || analysisResult.tables.length === 0) {
      return []
   }

   const pageDataList: PageData[] = []

   // Iterate over each table, treating its index as the page number.
   analysisResult.tables.forEach((table, index) => {
      const { columnCount, cells } = table
      const pageNumber = index + 1 // Use table index as page number
      const rows: string[][] = []

      const currentRow: string[] = []
      cells.forEach((cell, cellIndex) => {
         currentRow.push(sanitize(cell.content))

         // When we reach the end of a row, add it to the rows list and reset.
         if ((cellIndex + 1) % columnCount === 0) {
            rows.push([...currentRow])
            currentRow.length = 0 // Clear the row for the next iteration.
         }
      })

      pageDataList.push({
         page: pageNumber,
         rows,
      })
   })

   return pageDataList
}


// --- Main Service Object ---

export const ocr = {
   /**
    * Analyzes an invoice from a public URL and extracts a list of page data.
    * @param {string} url - The public URL of the document to analyze.
    * @returns {Promise<PageData[]>} The extracted data as an array of page objects.
    */
   async extractInvoiceDataFromUrl(url: string): Promise<PageData[]> {
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
   }
} 