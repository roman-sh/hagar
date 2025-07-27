import { PassArgs } from '../../types/inventory'
import { database } from '../db'

/**
 * Applies historical matching decisions to unresolved items in an inventory document.
 * This pass mutates the 'doc' object directly and does not return a value,
 * consistent with the other passes in the pipeline.
 *
 * @param {PassArgs} passArgs - The arguments for the pass, containing the document and storeId.
 */
export async function historyPass({ doc, storeId, docId }: PassArgs): Promise<void> {
   const unresolvedItemNames = doc.items
      .filter(item => !item.match_type)            // not resolved or skipped
      .map(item => item.supplier_item_name)       // get the names
      .filter(Boolean)                             // name have to be defined

   if (!unresolvedItemNames.length) {
      log.info(
         { docId },
         `[history-pass] No unresolved items found. Returning.`
      )
      return
   }

   log.info(
      { docId },
      `[history-pass] Attempting to find history for ${unresolvedItemNames.length} unresolved items.`
   )

   const pastMatches = await database
      .resolveHistoryItems(storeId, [...new Set(unresolvedItemNames)])

   if (!Object.keys(pastMatches).length) {
      log.info(
         { docId },
         `[history-pass] No historical matches found. Returning.`
      )
      return
   }

   log.info(
      { docId },
      `[history-pass] Found ${Object.keys(pastMatches).length} unique historical matches.`
   )

   let updatedCount = 0
   for (const item of doc.items) {
      const match = pastMatches[item.supplier_item_name]
      if (match) {
         // Apply the historical resolution, mutating the item object directly.
         item.inventory_item_id = match.inventory_item_id
         item.inventory_item_name = match.inventory_item_name
         item.inventory_item_unit = match.inventory_item_unit
         // for ignored items, we keep the skip type
         item.match_type =
            match.match_type === 'skip'
               ? 'skip'
               : 'history'
         updatedCount++
      }
   }
   log.info(
      { docId },
      `[history-pass] Successfully updated ${updatedCount} items.`
   )
} 