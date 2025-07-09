import { Job } from 'bull'
import { JobData } from '../types/jobs.js'
import { database } from '../services/db.js'
import { inventory } from '../services/inventory.js'
import { barcodePass, vectorPass, aiPass } from '../services/inventory-items/index.js'
import {
   InventoryDocument,
   PassArgs,
   CatalogModule,
} from '../types/inventory.js'
import { INVENTORY_UPDATE } from '../config/constants.js'

/**
 * A generic Bull processor for the 'inventory_update' queue.
 * It dynamically loads system-specific modules to perform tasks
 * like catalog synchronization.
 *
 * @param job The Bull job object, where job.id is the document ID.
 * @returns An unresolved promise to keep the job in an active state.
 */
export async function inventoryUpdateProcessor(
   job: Job<JobData>
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

   // 5. Run the passes.
   const passes = [
      barcodePass,
      (args: PassArgs) => aiPass({ ...args, passName: 'barcode-collision' }),
      vectorPass,
      (args: PassArgs) => aiPass({ ...args, passName: 'vector' }),
   ]

   for (const pass of passes) {
      if (inventoryReady(doc)) break
      await pass({ doc, storeId, docId })
   }

   await database.saveArtefact({
      docId,
      storeId,
      queue: INVENTORY_UPDATE,
      key: 'resolved_inventory_document',
      data: doc,
   })
   log.info({ docId, storeId }, 'Resolved inventory document saved to artefacts')

   // The job will hang here until completed by an external trigger.
   return new Promise(() => { })
}


// -------- Helper functions --------

function inventoryReady(doc: InventoryDocument) {
   return doc.items.every(i => i.inventory_item_id)
} 