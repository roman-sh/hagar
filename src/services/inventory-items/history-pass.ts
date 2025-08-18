import { PassArgs } from '../../types/inventory'
import { database } from '../db'

/**
 * Applies historical matching decisions to unresolved items in an inventory document.
 * This pass mutates the 'doc' object directly and does not return a value.
 * It calculates a dynamic fuzzy matching threshold for each unresolved item
 * and fetches all historical matches in parallel for maximum efficiency.
 *
 * @param {PassArgs} passArgs - The arguments for the pass, containing the document and storeId.
 */
export async function historyPass({ doc, storeId, docId }: PassArgs): Promise<void> {
   const unresolvedItems = doc.items.filter(item => !item.match_type && item.supplier_item_name)

   if (!unresolvedItems.length) {
      log.info({ docId }, `[history-pass] No unresolved items found. Returning.`)
      return
   }

   log.info({ docId }, `[history-pass] Attempting to find history for ${unresolvedItems.length} unresolved items.`)

   // Create a promise for each unresolved item's history search.
   // This allows us to run all database queries in parallel.
   const historyPromises = unresolvedItems.map(item => {
      const supplierName = item.supplier_item_name
      const len = supplierName.length

      // MongoDB Atlas Search requires maxEdits to be 1 or 2.
      const maxEdits = len < 15 ? 1 : 2
      
      return database.resolveHistoryItems(storeId, supplierName, maxEdits)
   })

   // Await all the parallel queries to complete.
   const matches = await Promise.all(historyPromises)

   let updatedCount = 0
   // Loop through the original items and apply the corresponding match result.
   unresolvedItems.forEach((item, index) => {
      const match = matches[index]
      if (match) {
         item.inventory_item_id = match.inventory_item_id
         item.inventory_item_name = match.inventory_item_name
         item.inventory_item_unit = match.inventory_item_unit
         item.match_type = match.match_type === 'skip' ? 'skip' : 'history'
         updatedCount++
      }
   })

   if (updatedCount > 0) {
      log.info({ docId }, `[history-pass] Successfully updated ${updatedCount} items from history.`)
   } else {
      log.info({ docId }, `[history-pass] No historical matches found for any items.`)
   }
} 