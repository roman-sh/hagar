import { PassArgs } from '../../types/inventory'
import { database } from '../db'
import { EXPRESSION_REGEX } from '../../utils/math'

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
         
         // This is a mechanism that allows us to correctly adjust the quantity
         // for items that supplied by weight, but sold by quantity.
         // In this case the quantity field will hold a string expression.
         if (isExpression(match.quantity)) {
            item.quantity = applyRule(item.quantity, match.quantity)
         } 

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


/**
 * Matches a string representing a simple mathematical expression.
 * e.g., "2.00 * 10.5"
 * - Group 1: Captures the operator (* or /).
 * - Group 2: Captures the factor (the second number, including decimals).
 */

function isExpression(quantity: string): boolean {
   return EXPRESSION_REGEX.test(quantity)
}

/**
 * Applies a historical quantity conversion rule to a new item's quantity.
 * This function assumes the historical quantity is a valid expression.
 * It extracts the operator and factor from the historical expression and applies
 * it to the new item's quantity to generate a new expression string.
 *
 * @param currentItemQuantity The quantity from the item on the new invoice.
 * @param historicalExpression The quantity expression from the matched historical record.
 * @returns The transformed quantity expression string.
 */
function applyRule(currentItemQuantity: string, historicalExpression: string): string {
   // Extract the operator and factor from the historical expression.
   const match = historicalExpression.match(EXPRESSION_REGEX)

   const operator = match[2] // The operator (* or /)
   const factor = match[3]   // The factor (the second number)
   
   // Construct the new expression using the current item's quantity and the learned rule.
   return `${currentItemQuantity} ${operator} ${factor}`
} 