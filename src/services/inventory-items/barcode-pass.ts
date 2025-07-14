import { db } from '../../connections/mongodb'
import { PassArgs } from '../../types/inventory'
import { ProductDocument } from '../../types/documents'
import { H } from '../../config/constants'

/**
 * Performs a barcode-based matching pass on an inventory document.
 *
 * This function identifies all unresolved items with barcodes and uses a single,
 * efficient `$facet` aggregation query to find potential matches in the database.
 * This approach is highly scalable as it requires only one database round-trip
 * per invoice, regardless of the number of items.
 *
 * The query returns results pre-bucketed by the original barcode, making lookups
 * fast and simple.
 *
 * - If a barcode returns exactly one product, the item is considered resolved.
 * - If a barcode returns multiple products, those products are added as candidates
 *   for a subsequent AI pass to resolve.
 *
 * @param {PassArgs} input An object containing the document, storeId, and docId.
 * @returns {Promise<void>} A promise that resolves when the pass is complete.
 */
export const barcodePass = async (
   { doc, storeId, docId }: PassArgs
): Promise<void> => {
   
   const unresolvedItems = doc.items
      .filter(item => !item[H.INVENTORY_ITEM_ID] && item[H.BARCODE])

   if (!unresolvedItems.length) return

   log.info(
      { docId, count: unresolvedItems.length },
      `barcodePass: Found ${unresolvedItems.length} items with barcodes to process.`
   )

   const facets = Object.fromEntries(
      unresolvedItems.map(item => [
         item.barcode, // The key of the facet will be the barcode itself
         [   // The value is the pipeline to run for this barcode
            { $match: { storeId, barcodes: { $elemMatch: { $regex: new RegExp(item.barcode! + '$') } } } },
            { $project: { _id: 1, name: 1, unit: 1 } },
         ],
      ]),
   )

   const [resultsByBarcode]: Record<
      string, Pick<ProductDocument, '_id' | 'name' | 'unit'>[]
   >[] = await db.collection<ProductDocument>('products').aggregate([
      { $facet: facets },
   ]).toArray()

   let resolvedCount = 0
   const unmatchedBarcodes: string[] = []

   unresolvedItems.forEach((item) => {
      const hits = resultsByBarcode[item.barcode]

      if (hits.length === 1) {
         const hit = hits[0]
         item[H.INVENTORY_ITEM_ID] = hit._id
         item[H.INVENTORY_ITEM_NAME] = hit.name
         item[H.INVENTORY_ITEM_UNIT] = hit.unit
         item[H.MATCH_TYPE] = 'barcode'
         resolvedCount++
      }
      else if (hits.length > 1) {
         item.candidates = hits.map(h => ({
            productId: h._id,
            name: h.name,
            unit: h.unit,
         }))
         
         log.info(
            {
               docId,
               barcode: item[H.BARCODE],
               candidatesCount: hits.length
            },
            'barcodePass: Found multiple candidates for barcode.'
         )
      }
      else {
         unmatchedBarcodes.push(item[H.BARCODE])
      }
   })

   log.info(
      { docId, resolvedCount },
      `barcodePass: Resolved ${resolvedCount} items with unique matches.`
   )

   if (unmatchedBarcodes.length > 0) {
      log.warn(
         { docId, barcodes: unmatchedBarcodes },
         `barcodePass: Could not find matches for ${unmatchedBarcodes.length} barcodes.`
      )
   }
}