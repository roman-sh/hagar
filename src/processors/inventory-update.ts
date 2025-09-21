import { Job } from 'bull'
import { OptionalId } from 'mongodb'
import { db } from '../connections/mongodb'
import { UPDATE_PREPARATION, H } from '../config/constants'
import { database } from '../services/db'
import { gpt } from '../services/gpt'
import { ScanDocument, MessageDocument, DocType } from '../types/documents'
import { InventoryUpdateJobData, UpdatePreparationJobCompletedPayload } from '../types/jobs'
import { InventoryItem, CatalogModule, UpdateModule, InventoryDocument } from '../types/inventory'
import { QueueKey } from '../queues-base'
import { evaluateExpression } from '../utils/math'


/**
 * A generic Bull processor for the 'inventory_update' queue.
 * It orchestrates the common steps of an inventory update and dynamically
 * loads a system-specific module to handle the final API communication.
 * @param job - The Bull job object for the inventory update task.
 */
export async function inventoryUpdateProcessor(
   job: Job<InventoryUpdateJobData>
): Promise<void> {
   const docId = job.id as string
   job.log('Starting inventory update process.')

   // 1. Get the store and system details from the database.
   const { storeId, system } = await database.getStoreByDocId(docId)

   // 2. Dynamically import the services for the specific system (vite specific syntax).
   const catalogModule = import.meta.glob('../systems/*/catalog.ts')
   const catalogPath = `../systems/${system}/catalog.ts`
   const { catalog } = await catalogModule[catalogPath]() as CatalogModule

   const updateModule = import.meta.glob('../systems/*/update.ts')
   const updatePath = `../systems/${system}/update.ts`
   const { updater } = await updateModule[updatePath]() as UpdateModule

   // 3. Fetch approved items from the completed 'update_preparation' stage.
   const inventoryDoc = await getApprovedInventoryDraft(docId)
   const approvedItems = inventoryDoc.items
   job.log(`Found ${approvedItems.length} approved items for store ${storeId}.`)

   // 4. Filter out items that were skipped or not matched to an internal product.
   const matchedItems = approvedItems.filter(item =>
      item[H.INVENTORY_ITEM_ID] && item[H.MATCH_TYPE] !== 'skip'
   )
   job.log(`Filtered down to ${matchedItems.length} matched items with valid IDs.`)

   // 5. Evaluate any quantity expressions into final numbers before updating.
   try {
      matchedItems.forEach(item => {
         // evaluateExpression handles both expressions and simple number strings.
         item[H.QUANTITY] = evaluateExpression(item[H.QUANTITY])
      })
   }
   catch (error) {
      log.error({ docId, err: error }, 'Failed to evaluate quantity expressions.')
      throw error // Fail the job if any quantity is invalid.
   }


   // 6. Fetch Live Catalog from the system-specific service
   const liveCatalog = await catalog.get(storeId)
   job.log(`Fetched ${liveCatalog.length} products from live catalog.`)

   // 7. Build & Persist Pre-Update Snapshot using the system-specific service.
   const preUpdateSnapshot = updater.createPreUpdateSnapshot(liveCatalog, matchedItems, storeId)

   await database.saveArtefact({
      docId,
      queue: job.queue.name as QueueKey,
      key: 'pre_update_snapshot',
      data: preUpdateSnapshot,
   })
   job.log(`Saved pre-update snapshot with ${preUpdateSnapshot.length} items to artefacts.`)

   // 8. Execute Update and Handoff to AI
   const phone = await database.getScanOwnerPhone(docId)
   try {
      await updater.executeUpdate(storeId, preUpdateSnapshot, matchedItems)
      job.log('Successfully sent update payload to external API.')

      // After a successful update, create and save a summary to the job for the finalize tool.
      const summary = createUpdateSummary(inventoryDoc, approvedItems, matchedItems)
      await job.update({ summary })

      await triggerAiHandoff(docId, storeId, phone, {
         event: 'inventory_update_succeeded',
         action: 'finalize_inventory_update'
      })
      job.log('AI handoff triggered for successful update.')

   } catch (error) {
      const errorMessage = `Inventory update failed. Error: ${(error as Error).message}`
      job.log(errorMessage)
      log.error({ docId, storeId, err: error }, 'Inventory update failed.')

      await triggerAiHandoff(docId, storeId, phone, {
         event: 'inventory_update_failed',
         error: errorMessage,
      })

      throw error
   }

   // The job will hang here until completed by an external trigger (the finalize tool).
   return new Promise(() => { })
}


/**
 * Fetches the approved inventory draft from the completed 'update_preparation' stage of a scan document.
 * @param docId - The ID of the scan document.
 * @returns A promise that resolves to the approved InventoryDocument.
 * @throws An error if the document or the completed preparation data cannot be found.
 */
async function getApprovedInventoryDraft(docId: string): Promise<InventoryDocument> {
   const scanDoc = await db.collection<ScanDocument>('scans').findOne(
      { _id: docId },
      { projection: { [UPDATE_PREPARATION]: 1 } }
   )
   const inventoryDoc = (scanDoc?.[UPDATE_PREPARATION] as UpdatePreparationJobCompletedPayload)?.data

   if (!inventoryDoc) {
      const message = `Could not find a completed update_preparation document for docId: ${docId}`
      log.error({ docId }, message)
      throw new Error(message)
   }

   return inventoryDoc
}


/**
 * Creates a summary object of the inventory update process.
 * @param inventoryDoc - The full inventory document containing metadata.
 * @param approvedItems - The original list of all approved items.
 * @param matchedItems - The filtered list of items that were actually updated.
 * @returns A summary object with supplier, invoiceId, and item counts.
 */
function createUpdateSummary(
   inventoryDoc: InventoryDocument,
   approvedItems: InventoryItem[],
   matchedItems: InventoryItem[]
) {
   const summary = {
      supplier: inventoryDoc.meta.supplier,
      invoiceId: inventoryDoc.meta.invoiceId,
      totalItemsCount: approvedItems.length,
      updatedItemsCount: matchedItems.length,
   }
   return summary
}


/**
 * Injects a message into the database to trigger an AI handoff.
 * This function is used to notify the AI of the outcome of the update process.
 * @param docId - The document ID for context.
 * @param storeId - The store ID.
 * @param phone - The user's phone number to send the notification to.
 * @param content - The content of the message, typically including an event and/or action.
 */
async function triggerAiHandoff(
   docId: string,
   storeId: string,
   phone: string,
   content: Record<string, any>
) {
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      contextId: docId,
      name: 'app',
      content,
      storeId,
      createdAt: new Date(),
   })

   gpt.process({ phone, contextId: docId })
}
