import { openai } from '../../connections/openai'
import { H, INVENTORY_UPDATE_HEADERS } from '../../config/constants'
import headerMappingPrompt from '../../prompts/header-mapping.md'
import { AUX_MODEL } from '../../config/settings'
import { type ResponseFormatJSONSchema } from 'openai/resources/shared'
import { InventoryDocument, InventoryItem } from '../../types/inventory'
import { database } from '../db'

// Define the headers we expect to find in the supplier's document,
// derived from our master H constant object.
const SUPPLIER_HEADERS_TO_FIND = [
   H.ROW_NUMBER,
   H.SUPPLIER_ITEM_NAME,
   H.SUPPLIER_ITEM_UNIT,
   H.QUANTITY,
   H.BARCODE,
] as const

// This defines the structure of the object we expect the AI to return.
// e.g., { "row_number": null, "supplier_item_name": 0, ... }
type HeaderToIdxMap = {
   [key in (typeof SUPPLIER_HEADERS_TO_FIND)[number]]: number | null
}

/**
 * Uses an AI to map headers from a supplier's document to our standard headers.
 * @param rawHeaders An array of header strings extracted from the source document.
 * @param rows A sample of rows from the table data.
 * @returns A promise that resolves to an object mapping standard headers to their found index.
 */
export async function mapHeaders(
   rawHeaders: string[],
   rows: string[][]
): Promise<HeaderToIdxMap> {
   try {
      const prompt = getPrompt(rawHeaders, rows)

      const response = await openai.chat.completions.create({
         model: AUX_MODEL,
         messages: [
            {
               role: 'system',
               content: prompt,
            },
         ],
         response_format: {
            type: 'json_schema',
            json_schema: getHeaderMappingSchema(),
         },
      })

      const result = response.choices[0].message.content
      return JSON.parse(result) as HeaderToIdxMap
   } catch (error) {
      log.error(error, 'Failed to get or parse header mapping from AI')
      throw error
   }
}

/**
 * Initializes a new InventoryDocument from a given document ID.
 * It fetches the raw OCR table data and the scan metadata from the database,
 * then transforms it into a structured document ready for the matching process.
 * @param docId The ID of the scan document to process.
 * @returns A promise that resolves to a initialized InventoryDocument.
 */
export async function initializeDocument(
   docId: string
): Promise<InventoryDocument> {
   const tables = await database.getOcrDataFromScan(docId)
   const allItems: InventoryItem[] = []

   for (const table of tables) {
      const headerToIdxMap = await mapHeaders(table.header, table.rows)

      const itemsFromTable = table.rows.map(row => {
         const item: InventoryItem = { [H.PAGE_NUMBER]: String(table.page) }

         // Populate the item by iterating over our canonical headers
         for (const header of SUPPLIER_HEADERS_TO_FIND) {
            const idx = headerToIdxMap[header]
            if (idx == null) continue

            const rawValue = row[idx]
            ;(item as any)[header] = rawValue
         }

         // Per design, ensure all items have a complete, canonical set of properties.
         for (const key of INVENTORY_UPDATE_HEADERS) {
            if (!(key in item)) {
               // The type gymnastics are necessary because InventoryItem has mixed optional types,
               // but we are enforcing a canonical shape with string defaults.
               ;(item as any)[key] = ''
            }
         }

         return item
      })

      // If the headers map doesn't contain a row number (is nullish), generate it.
      if (headerToIdxMap[H.ROW_NUMBER] == null) {
         itemsFromTable.forEach((item, index) => {
            item[H.ROW_NUMBER] = String(index + 1)
         })
      }

      allItems.push(...itemsFromTable)
   }

   return {
      meta: await database.getMetadataFromScan(docId),
      items: allItems,
   }
}

// --- Helper Functions ---

/**
 * Dynamically generates a JSON schema for the OpenAI API.
 * This schema forces the AI to return a JSON object where each key is one of our
 * standard inventory headers, and the value is the numeric index of where that
 * header was found in the source document, or null if it wasn't found.
 * This ensures we get a predictable, structured mapping from the AI.
 * @returns {ResponseFormatJSONSchema.JSONSchema} The schema object for the API call.
 */
const getHeaderMappingSchema = (): ResponseFormatJSONSchema.JSONSchema => {
   const properties = SUPPLIER_HEADERS_TO_FIND.reduce(
      (acc: { [key: string]: { type: string[] } }, header) => {
         acc[header] = { type: ['number', 'null'] }
         return acc
      },
      {}
   )

   return {
      name: 'map_headers',
      strict: true,
      schema: {
         type: 'object',
         properties,
         required: SUPPLIER_HEADERS_TO_FIND,
         additionalProperties: false,
      },
   }
}

const getPrompt = (rawHeaders: string[], rows: string[][]): string => {
   const sourceHeaders = JSON.stringify(rawHeaders)
   const systemHeaders = JSON.stringify(SUPPLIER_HEADERS_TO_FIND)
   const dataSample = JSON.stringify(rows.slice(0, 3)) // Take first 5 rows as a sample

   return headerMappingPrompt
      .replace('{{SOURCE_HEADERS}}', sourceHeaders)
      .replace('{{SYSTEM_HEADERS}}', systemHeaders)
      .replace('{{DATA_SAMPLE}}', dataSample)
} 