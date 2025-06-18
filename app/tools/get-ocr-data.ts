import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'


export const getOcrDataSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'getOcrData',
      description: 'Retrieves the structured OCR data for a given document, allowing for review and correction.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document to retrieve data for.',
            },
         },
         required: ['docId'],
      },
   },
}

/**
 * Retrieves the OCR data from a specified scan document.
 * @param docId The ID of the document to fetch data from.
 * @returns The structured data extracted during the OCR process.
 */
export async function getOcrData({ docId }: { docId: string }) {
   try {
      const data = await database.getOcrDataFromScan(docId)
      log.info({ docId }, `Retrieved OCR data for review.`)

      return {
         success: true,
         data,
      }
   } catch (error) {
      const errorMessage = `Failed to retrieve OCR data for document ${docId}.`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`,
      }
   }
} 