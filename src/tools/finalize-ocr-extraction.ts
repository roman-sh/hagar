import { ChatCompletionTool } from 'openai/resources'
import { pipeline } from '../services/pipeline'
import { database } from '../services/db'


interface FinalizeOcrExtractionArgs {
  docId: string
  data: any[]
}

export const finalizeOcrExtractionSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeOcrExtraction',
      description: 'Finalizes the OCR data extraction and review step, marking it as complete and moving the document to the next processing stage.',
      parameters: {
         type: 'object',
         properties: {
            data: {
               type: 'array',
               description: 'The final, validated structured data. If corrections were made, provide the full corrected array. If no corrections were needed, provide an empty array `[]`.',
               items: {
                  type: 'object',
                  properties: {
                     table: { type: 'number' },
                     page: { type: 'number' },
                     header: { type: 'array', items: { type: 'string' } },
                     rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  },
                  required: ['table', 'page', 'header', 'rows'],
               }
            },
         },
         required: ['data'],
      },
   }
}

/**
 * Finalizes the OCR extraction step and advances the document to the next stage in the pipeline.
 *
 * This function is called by the AI agent to finalize the OCR step. There are two main scenarios:
 * 1. No Corrections Needed (Category 1/2): The automated review was successful. The agent calls this tool with an empty array `[]` for the `data` parameter to approve the existing data in the database.
 * 2. Corrections Were Made (Category 3): After an interactive session with the user, the agent calls this tool with the full, corrected `data` array.
 *
 * The logic below handles both cases by checking if the provided `data` array is empty.
 * @param docId The ID of the document to finalize.
 * @param data The corrected data from the AI. If empty (`[]`), the data from the initial automated review is used.
 * @returns A confirmation message indicating the result of the operation.
 */
// TODO: refactor to pass only the corrected rows, not the entire table object
export async function finalizeOcrExtraction(args: FinalizeOcrExtractionArgs) {
   const docId = args.docId
   try {
      // If the AI provides a non-empty array, use it. Otherwise, fall back to the DB.
      const useProvidedData = Array.isArray(args.data) && args.data.length
      const data = useProvidedData
         ? args.data
         : await database.getOcrDataFromScan(docId)
      
      // Count items by summing the number of rows in each table object
      const itemsCount = data.reduce((acc: number, table: { rows: any[] }) => acc + table.rows.length, 0)

      const nextStage = await pipeline.advance(docId, { data })

      log.info({ docId, nextStage, itemsCount }, `OCR extraction finalized.`)

      return {
         success: true,
         isSilent: !!nextStage,
         nextStage,
         itemsCount,
      }
   } catch (error) {
      const errorMessage = `Failed to finalize OCR extraction for document ${docId}.`
      log.error(error, errorMessage)
      
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`
      }
   }
} 