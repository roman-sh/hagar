import { Job } from 'bull'
import { JobData } from '../../types/jobs'
import { database } from '../../services/db'
import { catalog } from '../../systems/rexail/catalog'
import { inventory } from '../../services/inventory'
import { barcodePass, vectorPass, aiPass, regexPass } from '../../services/inventory-items'
import { InventoryDocument, PassArgs } from '../../types/inventory'


/**
 * Bull processor for the 'rexail' inventory update job.
 * This processor is named and will only be called for jobs explicitly named 'rexail'.
 *
 * @param job The Bull job object, where job.id is the document ID.
 * @returns An unresolved promise to keep the job in an active state.
 */
export default async function rexailInventoryUpdateProcessor(
   job: Job<JobData>
): Promise<void> {
   const docId = job.id as string
   log.info({ docId }, 'Starting Rexail inventory update process.')

   // 1. Get the store details from the database using the document/job ID.
   const { storeId } = await database.getStoreByDocId(docId)

   // 2. Populate the catalog for the specific store in db's products collection.
   await catalog.sync(storeId)

   // 3. Initialize the inventory document from extracted data.
   const doc = await inventory.initializeDocument(docId)

   // 4. Run the passes.
   const passes = [
      barcodePass,         // fast, exact
      (args: PassArgs) =>  // first AI attempt (barcode candidates in case of collision, rare)
         aiPass({ ...args, passName: 'barcode-collision' }),
      vectorPass,          // adds candidates for no-barcode rows (embedded name search)
      (args: PassArgs) =>  // second AI attempt (vector candidates)
         aiPass({ ...args, passName: 'vector' }),
      // regexPass,           // builds regex candidates for any still-open rows
      // (args: PassArgs) =>  // third AI attempt (regex candidates)
      //    aiPass({ ...args, passName: 'regex' })
   ]

   for (const pass of passes) {
      if (inventoryReady(doc)) break
      await pass({ doc, storeId, docId })
   }

   // single save after all automatic work
   // await inventory.saveDocument(docId, doc)


   // The job will hang here until completed by an external trigger (e.g., AI tool).
   return new Promise(() => { })
}


// -------- Helper functions --------

function inventoryReady(doc: InventoryDocument) {
   return doc.items.every(i => i.inventory_item_id)
}
