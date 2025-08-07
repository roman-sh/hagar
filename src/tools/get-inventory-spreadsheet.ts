import { ChatCompletionTool } from 'openai/resources'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'
import * as inventory from '../services/inventory'
import { InventoryDraftNotFoundError } from '../errors/application-errors'


interface GetInventorySpreadsheetArgs {
  docId: string
}

export const getInventorySpreadsheetSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'getInventorySpreadsheet',
      description: 'Retrieves the JSON spreadsheet representation of an inventory draft, used for providing context to the agent during a correction flow.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.',
            },
         },
         required: ['docId'],
      },
   },
}

/**
 * Retrieves the inventory document as a spreadsheet object.
 * @param {GetInventorySpreadsheetArgs} args - The arguments for the function.
 * @param {string} args.docId - The ID of the document being processed.
 * @returns {Promise<object>} An object containing the spreadsheet.
 */
export async function getInventorySpreadsheet({ docId }: GetInventorySpreadsheetArgs) {
   try {
      const { job } = await findActiveJob(docId)
      const doc = job.data as InventoryDocument

      if (!doc) { throw new InventoryDraftNotFoundError(
         `Could not find an inventory draft in job's data for docId ${docId}.`
      )}

      const spreadsheet = inventory.toSpreadsheet(doc)

      log.info({ docId }, 'Retrieved inventory draft as spreadsheet.')

      return {
         success: true,
         spreadsheet,
      }
   } catch (error) {
      const errorMessage = error instanceof InventoryDraftNotFoundError
         ? (error as Error).message
         : `Failed to get inventory draft as spreadsheet for docId ${docId}.`

      log.error(error, errorMessage)
      return {
         success: false,
         message: errorMessage
      }
   }
} 