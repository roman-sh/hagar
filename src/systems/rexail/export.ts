import ExcelJS from 'exceljs'
import { db } from '../../connections/mongodb'
import { ProductDocument } from '../../types/documents'
import { InventoryItem, ExportService, InvoiceMeta } from '../../types/inventory'
import { H } from '../../config/constants'
import { evaluateExpression } from '../../utils/math'
import { extractInventoryId, generateExportFilename } from '../../utils/inventory'

export const exporter: ExportService = {
   /**
    * Generates an Excel file tailored for Rexail import.
    * Structure: #, קוד פריט, כמות, מחיר יחידה, סה"כ
    */
   createExportFile: async (items: InventoryItem[], docId: string, meta: InvoiceMeta) => {
      // 1. Bulk Fetch System Barcodes
      // We need to fetch the 'barcodes' array for each matched product to prioritize
      // the system-known barcode (which includes external IDs) over the invoice barcode.
      const barcodeMap = await fetchSystemBarcodes(items)

      // 2. Generate Excel
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('קליטת תעודה מספק')

      // Define columns to match Rexail import screen.
      // Critical Formatting:
      // - 'code' uses '@' (Text) to prevent Excel from converting long barcodes to scientific notation (e.g. 7.29E+12).
      // - 'quantity', 'price', 'total' use '0.00' to explicitly display two decimal places.
      worksheet.columns = [
         { header: '#', key: 'index', width: 5, style: { numFmt: '@' } },
         { header: 'קוד פריט', key: 'code', width: 20, style: { numFmt: '@' } },
         { header: 'כמות', key: 'quantity', width: 10, style: { numFmt: '0.00' } },
         { header: 'מחיר', key: 'price', width: 10, style: { numFmt: '0.00' } },
         { header: 'סה"כ', key: 'total', width: 15, style: { numFmt: '0.00' } },
      ]

      // Style header
      // Make the first row bold and freeze it so it stays visible while scrolling.
      worksheet.getRow(1).font = { bold: true }
      worksheet.views = [{ state: 'frozen', ySplit: 1 }]

      // Add rows
      items.forEach(item => {
         
         const rawId = item[H.INVENTORY_ITEM_ID]
         let code: string

         if (rawId) {
            // Case 1: Item was matched (INVENTORY_ITEM_ID exists).
            
            // Priority 1: System Barcode (fetched from DB). 
            // This is the "Golden Path". It includes standard barcodes AND Rexail External IDs 
            // (e.g., 7-digit codes) that were ingested into our 'barcodes' array.
            // This guarantees the import will succeed automatically.
            
            // Priority 2: Internal ID (Fallback).
            // If we have no System Barcode, we fall back to the Internal ID (product ID).
            // This will cause a "Not Found" error in Rexail Import, BUT it provides the user 
            // with a searchable key in the Excel file. They can use this ID to manually 
            // search for the item in Rexail.
            
            code = barcodeMap.get(rawId) || extractInventoryId(rawId)
         } else {
            // Case 2: Item was NOT matched.
            // We put the Supplier Item Name in the Code column.
            // This allows the user to see the failed item in the import report (as a "Not Found" error)
            // and use the name to manually search and resolve it.
            code = item[H.SUPPLIER_ITEM_NAME]
         }

         let quantity: string | null = null
         try {
            quantity = evaluateExpression(item[H.QUANTITY])
         } catch {}

         worksheet.addRow({
            index: item[H.ROW_NUMBER],
            code,
            quantity,
            price: ' ',
            total: ' ',
         })
      })

      // Write to buffer
      // @ts-ignore
      const buffer = await workbook.xlsx.writeBuffer()
      
      const filename = generateExportFilename({
         extension: 'xlsx',
         docId,
         meta
      })

      return {
         filename,
         mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         data: buffer as unknown as Buffer
      }
   }
}

/**
 * Fetches system barcodes for a list of matched inventory items.
 * Returns a Map where the key is the inventory_item_id and the value is the best available barcode.
 */
async function fetchSystemBarcodes(items: InventoryItem[]): Promise<Map<string, string | undefined>> {
   // We filter out items that do not have an internal ID (INVENTORY_ITEM_ID), but not 'skip'ed.
   // These are "Unmatched" items which we support in the export (by showing their Supplier Name),
   // but we cannot fetch system barcodes for them because they are not linked to any product in our DB.
   const productIds = items
      .map(item => item[H.INVENTORY_ITEM_ID])
      .filter(Boolean) as string[]

   if (!productIds.length) {
      return new Map()
   }

   // Expected structure:
   // [
   //   { _id: "product:store:123", barcodes: ["12345", "67890"] },
   //   { _id: "product:store:456", barcodes: ["999"] },
   //   { _id: "product:store:789", barcodes: [] }
   // ]
   const products = await db.collection<ProductDocument>('products')
      .find({ _id: { $in: productIds } })
      .project<{ _id: string, barcodes: string[] }>({ barcodes: 1 })
      .toArray()

   const barcodeMap = new Map<string, string | undefined>()
   products.forEach(p => {
      barcodeMap.set(p._id, selectBarcode(p.barcodes))
   })

   return barcodeMap
}

/**
 * Helper to select barcode from a list of candidate barcodes.
 * Current logic: Pick the longest barcode (heuristic for EAN-13 vs internal codes).
 */
function selectBarcode(barcodes: string[]): string | undefined {
   // Sort descending by length to prefer longer barcodes (e.g. EAN-13)
   return [...barcodes].sort((a, b) => b.length - a.length)[0]
}
