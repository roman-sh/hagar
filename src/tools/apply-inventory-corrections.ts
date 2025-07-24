import { ChatCompletionTool } from 'openai/resources'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument, InventorySpreadsheet } from '../types/inventory'
import * as inventory from '../services/inventory'
import { ApplyInventoryCorrectionsArgs } from '../types/tool-args'
import { InvalidSpreadsheetFormatError } from '../errors/application-errors'
import { database } from '../services/db'
import { QueueKey } from '../queues-base'
import { createInventoryDiff } from '../utils/inventory-diff'

export const applyInventoryCorrectionsSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'applyInventoryCorrections',
      description: 'Applies a full set of corrections to an inventory draft by providing the complete, modified spreadsheet object.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.',
            },
            spreadsheet: {
               type: 'object',
               description: 'The complete and modified spreadsheet object, including meta, header, and rows.',
               properties: {
                  meta: { type: 'object' },
                  header: { type: 'array', items: { type: 'string' } },
                  rows: {
                     type: 'array',
                     items: {
                        type: 'array',
                        items: { type: 'string' },
                     },
                  },
               },
               required: ['meta', 'header', 'rows'],
            },
         },
         required: ['docId', 'spreadsheet'],
      },
   },
}

/**
 * Applies a full set of corrections to the inventory document.
 * @param {ApplyInventoryCorrectionsArgs} args - The arguments for the function.
 * @returns {Promise<object>} An object confirming the success or failure of the operation.
 */
export async function applyInventoryCorrections({ docId, spreadsheet }: ApplyInventoryCorrectionsArgs) {
   try {
      const { job, queueName } = await findActiveJob(docId)
      const originalDoc = job.data as InventoryDocument

      // Log a diff of the changes for auditing purposes.
      await logCorrectionDiff({ docId, queueName, originalDoc, spreadsheet })

      // Convert the spreadsheet back into a standard InventoryDocument.
      // If the spreadsheet is malformed, this may throw an error.
      let correctedDoc
      try { correctedDoc = inventory.fromSpreadsheet(spreadsheet) }
      catch (e) { throw new InvalidSpreadsheetFormatError(
         `Failed to apply corrections for docId ${docId} due to an invalid spreadsheet format.`
      )}

      // Overwrite the existing document in the job with the corrected version
      await job.update(correctedDoc)

      log.info({ docId }, 'Successfully applied inventory corrections to the draft.')

      return {
         success: true,
         message: 'The draft has been successfully updated with your changes.',
      }
   } catch (error) {
      const errorMessage = error instanceof InvalidSpreadsheetFormatError
         ? (error as Error).message
         : `Failed to apply inventory corrections for docId ${docId}. Error:\n${(error as Error).message}`

      log.error(error, errorMessage)
      return {
         success: false,
         message: errorMessage,
      }
   }
}

// --- Helper Functions ---

interface LogCorrectionDiffArgs {
   docId: string
   queueName: string
   originalDoc: InventoryDocument
   spreadsheet: InventorySpreadsheet
}

/**
 * Generates a diff between the original and corrected documents and saves it as a job artefact.
 */
async function logCorrectionDiff({ docId, queueName, originalDoc, spreadsheet }: LogCorrectionDiffArgs) {
   try {
      const originalSpreadsheet = inventory.toSpreadsheet(originalDoc)
      const diffText = createInventoryDiff(originalSpreadsheet, spreadsheet)

      // Only save an artefact if there were actual changes detected.
      if (!diffText.includes('Changes for Row')) {
         log.info({ docId }, 'Agent submitted corrections, but no changes were detected.')
         return
      }

      await database.saveArtefact({
         docId,
         queue: queueName as QueueKey,
         key: `correction-${new Date().toISOString()}`,
         data: { diff: diffText },
      })
   } catch (diffError) {
      log.error(diffError, `Failed to create or save inventory correction diff for docId ${docId}.`)
      // Do not block the main operation if diffing fails.
   }
} 