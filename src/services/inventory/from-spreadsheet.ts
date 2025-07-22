import { InventoryDocument, InventoryItem, InventorySpreadsheet } from '../../types/inventory'

/**
 * Converts an "spreadsheet" JSON object back into a standard InventoryDocument.
 * @param spreadsheet The spreadsheet object to convert.
 * @returns The reconstructed inventory document.
 */
export function fromSpreadsheet(spreadsheet: InventorySpreadsheet): InventoryDocument {
   const { meta, header, rows } = spreadsheet

   // 1. Reconstruct the items array from the header and rows.
   const items: InventoryItem[] = rows.map(row => {
      const item: any = {} // Using 'any' to allow dynamic property assignment
      header.forEach((key, index) => {
         // Gracefully handle rows that might be shorter than the header
         if (row.length > index) {
            item[key] = row[index]
         }
      })
      return item as InventoryItem
   })

   // 2. Construct and return the full InventoryDocument.
   const doc: InventoryDocument = {
      meta,
      items,
   }

   return doc
} 
