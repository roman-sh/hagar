import { Job } from 'bull'
import { UpdatePreparationJobData } from '../types/jobs'
import { database } from '../services/db'
import * as inventory from '../services/inventory'
import {
   barcodePass,
   vectorPass,
   aiPass
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

   // 4. Initialize the inventory document from extracted data.
   const doc = await inventory.initializeDocument(docId)

   // 5. Run the matching passes.
   const passes = [
      barcodePass,
      (args: PassArgs) => aiPass({ ...args, target: 'barcode-collision' }),
      vectorPass,
      (args: PassArgs) => aiPass({ ...args, target: 'vector' }),
   ]

   for (const pass of passes) {
      if (inventoryReady(doc)) break
      await pass({
         doc,
         storeId,
         docId,
         queue: job.queue.name as QueueKey,
      })
   }

   // 6. Save the processed document to the job data to retrieve it later from a tool.
   await job.update(doc)

   // Also save to artefacts for debugging.
   await database.saveArtefact({
      docId,
      storeId,
      queue: job.queue.name as QueueKey,
      key: 'processed_inventory_document',
      data: doc,
   })

   // 7. Get user phone number to trigger the confirmation flow.
   const { phone } = await database.getScanAndStoreDetails(docId)

   // 8. Inject a trigger message into the conversation for the agent to pick up.
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      name: 'app',
      content: {
         action: 'request_inventory_confirmation',
         docId,
      },
      storeId,
      createdAt: new Date(),
   })

   // 9. Trigger the GPT agent to process the new message.
   gpt.process({ phone, storeId })

   // The job will hang here until completed by an external trigger (the confirmation tool).
   return new Promise(() => { })
}


// -------- Helper functions --------

function inventoryReady(doc: InventoryDocument) {
   return doc.items.every(i => i.inventory_item_id)
} 