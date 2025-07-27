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
         'history': 0,
         'barcode': 0,
         'name': 0,
         'manual': 0,
         'skip': 0,
      },
   }

   for (const item of doc.items) {
      const matchType = item[H.MATCH_TYPE];

      switch (matchType) {
         case 'history':
         case 'barcode':
         case 'name':
         case 'manual':
            summary.matchedItems++;
            summary.matchTypes[matchType]++;
            break;

         case 'skip':
            summary.matchTypes.skip++;
            break;

         default:
            // This covers items with no match_type or an empty string
            summary.unmatchedItems++;
            break;
      }
   }

   return summary
} 