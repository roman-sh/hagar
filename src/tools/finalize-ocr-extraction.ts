import { ChatCompletionTool } from 'openai/resources'
import { pipeline } from '../services/pipeline'
import { FinalizeOcrExtractionArgs } from '../types/tool-args'
import { database } from '../services/db'


export const finalizeOcrExtractionSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeOcrExtraction',
      description: 'Finalizes the OCR data extraction and review step, marking it as complete and moving the document to the next processing stage.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.',
            },
            data: {
               type: 'array',
               description: 'The final, validated, and potentially corrected structured data. Provide this field ONLY if you have made corrections to the data that was initially provided to you.',
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
         required: ['docId'],
      },
   }
}

/**
 * Finalizes the OCR extraction step and advances the document to the next stage in the pipeline.
 *
 * This function is called by the AI agent to finalize the OCR step. There are two main scenarios:
 * 1. Automated Path: If the initial AI review was successful and corrected all issues, the agent calls this tool immediately without the 'data' parameter.
 * 2. Interactive Path: If the initial review found issues it could not correct, the agent consults the user. Once the user provides corrections, the agent calls this tool WITH the full, corrected 'data'.
 *
 * The logic below handles both cases by using the provided data if it exists, or falling back to the data already in the database.
 * @param docId The ID of the document to finalize.
 * @param data Optional. The corrected data provided by the AI after user interaction. If omitted, the data from the initial automated review is used.
 * @returns A confirmation message indicating the result of the operation.
 */
export async function finalizeOcrExtraction(args: FinalizeOcrExtractionArgs) {
   const { docId } = args
   try {
      // Use the provided data, or fall back to fetching it from the database.
      const data = args.data ?? (await database.getOcrDataFromScan(docId))
      // Count items by summing the number of rows in each table object
      const itemsCount = data.reduce((acc: number, table: { rows: any[] }) => acc + table.rows.length, 0)

      const nextStage = await pipeline.advance(docId, { data })

      log.info({ docId, nextStage, itemsCount }, `OCR extraction finalized.`)

      return { success: true, nextStage, itemsCount }
   } catch (error) {
      const errorMessage = `Failed to finalize OCR extraction for document ${docId}.`
      log.error(error, errorMessage)
      
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`
      }
   }
} 