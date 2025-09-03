import { Job } from 'bull'
import { UpdatePreparationJobData } from '../types/jobs'
import { database } from '../services/db'
import * as inventory from '../services/inventory'
import {
   historyPass,
   barcodePass,
   vectorPass,
   aiPass,
   lemmasPass
} from '../services/inventory-items'
import {
   InventoryDocument,
   PassArgs,
   CatalogModule,
} from '../types/inventory'
import { db } from '../connections/mongodb'
import { MessageDocument, DocType } from '../types/documents'
import { OptionalId } from 'mongodb'
import { gpt } from '../services/gpt'
import { QueueKey } from '../queues-base'

/**
 * A generic Bull processor for the 'inventory_update' queue.
 * It dynamically loads system-specific modules to perform tasks
 * like catalog synchronization.
 *
 * @param job The Bull job object, where job.id is the document ID.
 * @returns An unresolved promise to keep the job in an active state.
 */
export async function updatePreparationProcessor(
   job: Job<UpdatePreparationJobData>
): Promise<void> {
   const docId = job.id as string
   log.info({ docId }, 'Starting inventory update process.')

   // 1. Get the store and system details from the database.
   const { storeId, system } = await database.getStoreByDocId(docId)

   // 2. Dynamically import the catalog service for the specific system (vite specific syntax).
   const modules = import.meta.glob('../systems/*/catalog.ts')
   const path = `../systems/${system}/catalog.ts`
   const { catalog } = await modules[path]() as CatalogModule

   // 3. Sync the catalog.
   await catalog.sync(storeId)
   job.log('Catalog sync complete.')

   // 4. Initialize the inventory document from extracted data.
   const doc = await inventory.initializeDocument(docId)
   job.log('Initialized inventory document.')

   // 5. Run the matching passes in a structured pipeline.
   const passes = [
      historyPass,  // Apply historical matching decisions to unresolved items.
      barcodePass,  // High-confidence direct matches first.
      vectorPass,   // Gather candidates from vector search.
      lemmasPass,   // Gather additional candidates from text search.
      aiPass        // Consolidated AI review of all candidates.
   ]

   for (const pass of passes) {
      if (inventoryReady(doc)) {
         job.log('Inventory is ready, skipping remaining passes.')
         break
      }
      job.log(`Running matching pass: ${pass.name}...`)
      await pass({
         doc,
         storeId,
         docId,
         queue: job.queue.name as QueueKey,
      })
   }
   job.log('All matching passes are complete.')

   // 6. Save the processed document to the job data to retrieve it later from a tool.
   await job.update(doc)

   // --- Save artefact: initial document ---
   log.info({ docId }, '[Update Preparation] Saving initial document to artefacts.')
   await database.saveArtefact({
      docId,
      queue: job.queue.name as QueueKey,
      key: 'initial_document',
      data: doc,
   })
   // ---

   // 7. Get user phone number to trigger the confirmation flow.
   const phone = await database.getScanOwnerPhone(docId)

   // 8. Inject a trigger message into the conversation for the agent to pick up.
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      contextId: docId,
      name: 'app',
      content: {
         action: 'request_inventory_confirmation',
         docId,
      },
      storeId,
      createdAt: new Date(),
   })

   // 9. Trigger the GPT agent to process the new message.
   gpt.process({ phone, contextId: docId })

   const logMessage = `Agent triggered with action: request_inventory_confirmation`
   job.log(logMessage)
   log.info({ docId, storeId, phone }, logMessage)

   // The job will hang here until completed by an external trigger (the confirmation tool).
   return new Promise(() => { })
}


// -------- Helper functions --------

function inventoryReady(doc: InventoryDocument) {
   return doc.items.every(i =>
      i.inventory_item_id || i.match_type === 'skip'
   )
}
