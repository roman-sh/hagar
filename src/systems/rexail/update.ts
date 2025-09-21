import { H } from '../../config/constants'
import { InventoryItem } from '../../types/inventory'
import {
   RexailProduct,
   RexailManagedProductUpdate,
   RexailUnmanagedProductUpdate,
} from './rexail'
import rexailApi from './api'


/**
 * Filters the live catalog to create a "before" snapshot containing only
 * the products that are about to be updated.
 *
 * @param liveCatalog The full, live product catalog.
 * @param matchedItems The user-approved items to be updated.
 * @param storeId The ID of the store.
 * @returns An array of RexailProduct objects for the snapshot.
 */
function createPreUpdateSnapshot(
   liveCatalog: RexailProduct[],
   matchedItems: InventoryItem[],
   storeId: string
): RexailProduct[] {
   const matchedItemIds = new Set(matchedItems.map(item => item[H.INVENTORY_ITEM_ID]))
   const preUpdateSnapshot = liveCatalog.filter(product => {
      const internalProductId = `product:${storeId}:${product.nonObfuscatedId}`
      return matchedItemIds.has(internalProductId)
   })
   return preUpdateSnapshot
}

/**
 * Executes the inventory update for the Rexail system.
 * This function encapsulates the system-specific logic for building the payload
 * and sending it to the Rexail `create-or-update` API endpoint.
 *
 * @param storeId - The ID of the store being updated.
 * @param preUpdateSnapshot - An array of the original RexailProduct objects before any changes.
 * @param matchedItems - The filtered array of user-approved inventory items with the new quantities.
 */
async function executeUpdate(
   storeId: string,
   preUpdateSnapshot: RexailProduct[],
   matchedItems: InventoryItem[],
) {
   const finalPayload = buildUpdatePayload(preUpdateSnapshot, matchedItems, storeId)
   return rexailApi.post('catalog/products/create-or-update', finalPayload, { storeId })
}

export const updater = {
   createPreUpdateSnapshot,
   executeUpdate,
}

// ===================================================================================
// Private Helper Functions
// ===================================================================================

function buildUpdatePayload(
   preUpdateSnapshot: RexailProduct[],
   matchedItems: InventoryItem[],
   storeId: string
) {
   // Create a Map for efficient lookup of approved items by their internal ID.
   const matchedItemsMap = new Map<string, InventoryItem>(
      matchedItems.map(item => [item[H.INVENTORY_ITEM_ID], item])
   )

   // Transform each original product into its updated version.
   const productsForUpdate = preUpdateSnapshot
      .map((product): RexailManagedProductUpdate | RexailUnmanagedProductUpdate => {
         const internalProductId = `product:${storeId}:${product.nonObfuscatedId}`
         const matchedItem = matchedItemsMap.get(internalProductId)
         const newQuantity = Number(matchedItem[H.QUANTITY])

         if (product.stockManaged) {
            // Case 1: Product is already stock-managed. Use the additive method.
            return {
               ...product,
               quantityToAddToStock: newQuantity,
            }
         }
         else {
            // Case 2: Product is not stock-managed. Enable it using the absolute method.
            return {
               ...product,
               stockManaged: true,
               newQuantityInStock: newQuantity,
            }
         }
      })

   // Assemble the final payload in the required API structure.
   const finalPayload = {
      storeProductsForUpdate: productsForUpdate,
      childProductsForCreate: [] as any[], // Explicitly type empty array to satisfy linter.
   }

   return finalPayload
}
