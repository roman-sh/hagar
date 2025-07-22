import { H } from '../../config/constants'
import { InventoryDocument, MatchType } from '../../types/inventory'

export type InventoryUpdateSummary = {
   totalItems: number
   matchedItems: number
   unmatchedItems: number
   matchTypes: Record<MatchType, number>
}

/**
 * Creates a summary of the inventory document, counting total, matched,
 * and unmatched items, and breaking down matches by type.
 * @param doc The inventory document to summarize.
 * @returns A summary object.
 */
export function createSummary(doc: InventoryDocument): InventoryUpdateSummary {
   const summary: InventoryUpdateSummary = {
      totalItems: doc.items.length,
      matchedItems: 0,
      unmatchedItems: 0,
      matchTypes: {
         'barcode': 0,
         'barcode-collision': 0,
         'vector': 0,
         'regex': 0,
      },
   }

   for (const item of doc.items) {
      if (item[H.INVENTORY_ITEM_ID]) {
         summary.matchedItems++
         const matchType = item[H.MATCH_TYPE]
         if (matchType) {
            summary.matchTypes[matchType]++
         }
      } else {
         summary.unmatchedItems++
      }
   }

   return summary
} 