import { database } from '../../services/db'
import { PassArgs } from '../../types/inventory'
import { H } from '../../config/constants'
import { lemmatizer } from '../../services/lemmatizer'

/**
 * Performs a text-based matching pass using lemmatization on an inventory document.
 *
 * This function identifies all unresolved items, lemmatizes their supplier-provided names,
 * and then executes parallel Atlas Search queries for each item using `Promise.all`.
 *
 * The candidates found are added to each item's `candidates` array for a subsequent
 * AI pass to resolve.
 *
 * @param {PassArgs} input An object containing the document, storeId, and docId.
 * @returns {Promise<void>} A promise that resolves when the pass is complete.
 */
export const lemmasPass = async (
   { doc, storeId, docId }: PassArgs
): Promise<void> => {

   const unresolvedItems = doc.items.filter(
      item => !item[H.INVENTORY_ITEM_ID] && item[H.SUPPLIER_ITEM_NAME]
   )

   const itemNames = unresolvedItems.map(item => item[H.SUPPLIER_ITEM_NAME]!)
   const lemmatizedNameGroups = await lemmatizer.batchLemmatize(itemNames)

   log.info(
      { docId },
      `lemmasPass: Searching for ${unresolvedItems.length} items in parallel.`
   )

   const searchPromises = lemmatizedNameGroups.map(lemmas => 
      database.searchProductsByLemmas(lemmas, storeId)
   )

   const results = await Promise.all(searchPromises)

   let itemsWithNewCandidates = 0
   for (let i = 0; i < unresolvedItems.length; i++) {
      const item = unresolvedItems[i]
      const hits = results[i]
      
      if (hits?.length > 0) {
         if (!item.candidates) item.candidates = []
         item.candidates.push(...hits)
         itemsWithNewCandidates++
      }
   }

   log.info(
      { docId, count: itemsWithNewCandidates },
      `lemmasPass: Added new candidates to ${itemsWithNewCandidates} items.`
   )
} 