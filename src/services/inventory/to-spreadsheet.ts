import { InventoryDocument, InventoryItem, InventorySpreadsheet } from '../../types/inventory'
import { H } from '../../config/constants'

// Define a static, canonical header to ensure consistent ordering.
const SPREADSHEET_HEADER = Object.values(H) as (keyof InventoryItem)[]


/**
 * Converts an InventoryDocument into the token-efficient "spreadsheet" JSON format.
 * @param doc The inventory document to convert.
 * @returns The spreadsheet representation of the document.
 */
export function toSpreadsheet(doc: InventoryDocument): InventorySpreadsheet {
   // 1. Create the rows by mapping item values to the static header order.
   const rows = doc.items.map(item => {
      const row: (InventoryItem[keyof InventoryItem])[] = []
      for (const key of SPREADSHEET_HEADER) {
         // Our "upfront normalization" ensures every key exists, so we can directly push.
         row.push(item[key])
      }
      return row
   })

   // 2. Construct and return the spreadsheet object.
   const spreadsheet: InventorySpreadsheet = {
      meta: doc.meta,
      header: SPREADSHEET_HEADER,
      rows,
   }

   return spreadsheet
} 