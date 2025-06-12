import { ChatCompletionTool } from 'openai/resources'
import { pipeline } from '../services/pipeline'
import { FinalizeOcrExtractionArgs } from '../types/tool-args'

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
            extractedData: {
               type: 'array',
               description: 'The final, validated, and potentially corrected structured data extracted from the document by the OCR service.',
               items: {
                  type: 'object',
                  properties: {
                     page: { type: 'number' },
                     rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
                  },
                  required: ['page', 'rows'],
               }
            },
         },
         required: ['docId', 'extractedData'],
      },
   }
}

/**
 * Finalizes the OCR extraction step and advances the document to the next stage in the pipeline.
 * This tool is called by the AI after it has reviewed and confirmed the extracted data.
 * @param docId The ID of the document to finalize.
 * @param extractedData The final, validated data extracted from the document.
 * @returns A confirmation message indicating the result of the operation.
 */
export async function finalizeOcrExtraction({ docId, extractedData }: FinalizeOcrExtractionArgs) {
   try {
      await pipeline.advance(docId, extractedData)

      const message = `OCR extraction finalized for document ${docId}. Advanced to the next stage.`
      log.info({ docId }, message)

      return { success: true, message }
   } catch (error) {
      const errorMessage = `Failed to finalize OCR extraction for document ${docId}.`
      log.error(error, errorMessage)
      
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`
      }
   }
} 