import { ChatCompletionTool } from 'openai/resources'
import { findActiveJob } from '../services/pipeline'
import { H } from '../config/constants'
import { InventoryDocument, InventoryItem, InvoiceMeta } from '../types/inventory'
import { database } from '../services/db'
import { QueueKey } from '../queues-base'
import { validateApplyInventoryCorrectionsArgs } from '../validators/apply-inventory-corrections-args'

// --- Type Definitions ---

type RequiredCorrectionFields = Pick<InventoryItem, typeof H.ROW_NUMBER | typeof H.MATCH_TYPE>
type OptionalCorrectionFields = Partial<Pick<InventoryItem, typeof H.INVENTORY_ITEM_ID | typeof H.QUANTITY>>
type RowCorrection = RequiredCorrectionFields & OptionalCorrectionFields

// Extend RowCorrection to include the resolved product details for artefacts
type ResolvedRowCorrection = RowCorrection & {
   resolved_name?: string
   resolved_unit?: string
}

interface ApplyInventoryCorrectionsArgs {
   docId: string
   metaCorrection?: Partial<InvoiceMeta>
   rowCorrections?: RowCorrection[]
}

// --- Tool Schema and Implementation ---

export const applyInventoryCorrectionsSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'applyInventoryCorrections',
      description: 'Applies specific row and metadata corrections to an inventory draft.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.',
            },
            metaCorrection: {
               type: 'object',
               description: 'An object containing any metadata fields (e.g., date, supplier) that need to be changed.',
            },
            rowCorrections: {
               type: 'array',
               description: 'An array of objects, where each object represents a single row to be corrected.',
               items: {
                  type: 'object',
                  properties: {
                     row_number: { type: 'string', description: 'The row number to correct (from draft column).' },
                     match_type: { type: 'string', enum: ['manual', 'skip'], description: "Set to 'manual' for a product match or 'skip' to clear the match." },
                     inventory_item_id: { type: 'string', description: "The product's database ID (required for 'manual' match)." },
                     quantity: { type: 'string', description: 'The new quantity for the item (optional).' },
                  },
                  required: ['row_number', 'match_type'],
               }
            }
         },
         required: ['docId'],
      },
   },
}

export async function applyInventoryCorrections(args: unknown) {
   let validatedArgs: ApplyInventoryCorrectionsArgs
   try {
      // 1. Validate the incoming arguments against the Zod schema
      validatedArgs = validateApplyInventoryCorrectionsArgs(args)
   }
   catch (error) {
      log.error(error, 'Invalid arguments received for applyInventoryCorrections.')
      return {
         success: false,
         message: 'Argument validation failed. Please check the errors and try again.',
         errors: error, // Forward the structured Zod error object to the agent
      }
   }

   const { docId, metaCorrection, rowCorrections } = validatedArgs
   try {
      // 2. Proceed with the main logic
      const { job, queueName } = await findActiveJob(docId)
      const doc = job.data as InventoryDocument

      if (metaCorrection) {
         Object.assign(doc.meta, metaCorrection)
         log.info({ docId, updatedFields: Object.keys(metaCorrection) }, 'Applied metadata corrections.')
      }

      if (rowCorrections?.length) {
         await processRowCorrections(doc, rowCorrections)
         log.info({ docId, correctionCount: rowCorrections.length }, 'Applied row corrections.')
      }
      
      await job.update(doc)

      // After applying changes, save the debug artefact
      await saveCorrectionArtefact(docId, doc, queueName, { metaCorrection, rowCorrections })

      log.info({ docId }, 'Successfully applied inventory corrections to the draft.')
      return {
         success: true,
         message: 'The draft has been successfully updated with your changes.',
      }
   } catch (error) {
      const errorMessage = `Failed to apply inventory corrections for docId ${docId}. Error:\n${(error as Error).message}`
      log.error(error, errorMessage)
      return {
         success: false,
         message: errorMessage,
      }
   }
}

// --- Helper Functions ---

/**
 * Applies all provided row corrections directly to the `InventoryDocument`.
 * This function's only job is to modify the document; it does not return anything.
 * It operates in two main phases:
 * 1.  **Batch Fetch**: Gathers all unique product IDs from 'manual' corrections and fetches their details
 *     in a single, efficient database query.
 * 2.  **Validation & Application**: Iterates through the provided corrections, validates each one by
 *     finding the corresponding item and product details, and then applies the changes to the document.
 * 
 * @param doc The inventory document to be modified.
 * @param corrections An array of `RowCorrection` objects provided by the AI.
 * @throws An error if a correction contains an invalid `row_number` or if a `manual` correction
 *         is missing an `inventory_item_id`.
 */
async function processRowCorrections(doc: InventoryDocument, corrections: RowCorrection[]): Promise<void> {
   // 1. Batch-fetch all product details for 'manual' corrections.
   const manualCorrections = corrections.filter(c => c.match_type === 'manual')
   const productIdsToFetch = manualCorrections.map(c => c.inventory_item_id)

   const productDetailsResults = await database.getInventoryProductDetails(productIdsToFetch)
   
   // 2. Iterate through the original corrections to validate and apply them.
   //    We directly mutate the document here.
   corrections.forEach(correction => {
      const item = doc.items.find(i => i.row_number === correction.row_number)
      if (!item) throw new Error(
         `Invalid row number '${correction.row_number}' provided. No such row exists in the document.`)

      switch (correction.match_type) {
         case 'manual': {
            const details = productDetailsResults.find(p => p._id === correction.inventory_item_id)
            if (!details) throw new Error(
               `Failed to find details for product ID '${correction.inventory_item_id}' on row '${correction.row_number}'. The product may not exist.`)
            
            item.inventory_item_id = correction.inventory_item_id
            item.inventory_item_name = details.name
            item.inventory_item_unit = details.unit
            item.quantity = correction.quantity || item.quantity
            break
         }
         case 'skip': {
            item.inventory_item_id = ''
            item.inventory_item_name = ''
            item.inventory_item_unit = ''
            break
         }
      }
      item.match_type = correction.match_type
   })
}

/**
 * Builds and saves a detailed log of the corrections that were just applied.
 * This is used for creating a debug artefact.
 */
async function saveCorrectionArtefact(
   docId: string,
   doc: InventoryDocument,
   queueName: string,
   { metaCorrection, rowCorrections: originalCorrections }: { metaCorrection?: Partial<InvoiceMeta>, rowCorrections?: RowCorrection[] }
) {
   if (!metaCorrection && !originalCorrections?.length) {
      log.info({ docId }, 'No corrections provided, skipping artefact creation.')
      return
   }

   const itemsByRow = new Map(doc.items.map(item => [item.row_number, item]))
   const resolvedCorrections: ResolvedRowCorrection[] = []

   if (originalCorrections?.length) {
      for (const correction of originalCorrections) {
         const item = itemsByRow.get(correction.row_number)
         const resolved: ResolvedRowCorrection = { ...correction }
         if (item) {
            resolved.resolved_name = item.inventory_item_name
            resolved.resolved_unit = item.inventory_item_unit
         }
         resolvedCorrections.push(resolved)
      }
   }

   try {
      await database.saveArtefact({
         docId,
         queue: queueName as QueueKey,
         key: `correction-${new Date().toISOString()}`,
         data: { metaCorrection, rowCorrections: resolvedCorrections },
      })
   } catch (error) {
      log.error(error, `Failed to create or save inventory correction artefact for docId ${docId}.`)
      // Do not block the main operation if artefact saving fails.
   }
}
