import { openai } from '../connections/openai'
import { H } from '../config/constants'
import headerMappingPrompt from '../prompts/header-mapping.md'
import { AUX_MODEL } from '../config/settings'
import { type ResponseFormatJSONSchema } from 'openai/resources/shared'
import { type InventoryItem, type InventoryDocument } from '../types/inventory'
import { type TableData } from './ocr'
import { database } from './db'

// Define the headers we expect to find in the supplier's document,
// derived from our master H constant object.
const SUPPLIER_HEADERS_TO_FIND = [
  H.ROW_NUMBER,
  H.SUPPLIER_ITEM_NAME,
  H.QUANTITY,
  H.UNIT,
  H.BARCODE
] as const

// Headers whose values should be treated as numbers when populating an InventoryItem
const NUMERIC_HEADERS = new Set<string>([
  H.QUANTITY
])

// This defines the structure of the object we expect the AI to return.
// e.g., { "row_number": null, "supplier_item_name": 0, ... }
type HeaderToIdxMap = {
   [key in (typeof SUPPLIER_HEADERS_TO_FIND)[number]]: number | null
}

export const inventory = {
   /**
    * Uses an AI to map headers from a supplier's document to our standard headers.
    * @param rawHeaders An array of header strings extracted from the source document.
    * @returns A promise that resolves to an object mapping standard headers to their found index.
    */
   mapHeaders: async (rawHeaders: string[]): Promise<HeaderToIdxMap> => {
      try {
         const prompt = getPrompt(rawHeaders)

         const response = await openai.chat.completions.create({
            model: AUX_MODEL,
            messages: [
               {
                  role: 'system',
                  content: prompt
               }
            ],
            response_format: {
               type: 'json_schema',
               json_schema: getHeaderMappingSchema()
            },
         })

         const result = response.choices[0].message.content
         return JSON.parse(result) as HeaderToIdxMap
      }
      catch (error) {
         log.error(error, 'Failed to get or parse header mapping from AI')
         throw error
      }
   },

   /**
    * Initializes a new InventoryDocument from a given document ID.
    * It fetches the raw OCR table data and the scan metadata from the database,
    * then transforms it into a structured document ready for the matching process.
    * @param docId The ID of the scan document to process.
    * @returns A promise that resolves to a initialized InventoryDocument.
    */
   initializeDocument: async (docId: string): Promise<InventoryDocument> => {
      const tables = await database.getOcrDataFromScan(docId)
      const allItems: InventoryItem[] = []

      for (const table of tables) {
         const headerToIdxMap = await inventory.mapHeaders(table.header)

         const itemsFromTable = table.rows.map(row => {
            const item: InventoryItem = { pageNumber: table.page }

            // Populate the item by iterating over our canonical headers
            for (const header of SUPPLIER_HEADERS_TO_FIND) {
               const idx = headerToIdxMap[header]
               if (idx == null) continue

               const rawValue = row[idx]
               ;(item as any)[header] =
                  NUMERIC_HEADERS.has(header) ? +rawValue : rawValue
            }

            return item
         })

         allItems.push(...itemsFromTable)
      }

      return {
         meta: await database.getMetadataFromScan(docId),
         items: allItems
      }
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
      }, {}
   )

   return {
      name: 'header_map',
      strict: true,
      schema: {
         type: 'object',
         properties,
         required: SUPPLIER_HEADERS_TO_FIND,
         additionalProperties: false
      }
   }
}

const getPrompt = (rawHeaders: string[]): string => {
   const sourceHeaders = JSON.stringify(rawHeaders)
   const systemHeaders = JSON.stringify(SUPPLIER_HEADERS_TO_FIND)

   return headerMappingPrompt
      .replace('{{SOURCE_HEADERS}}', sourceHeaders)
      .replace('{{SYSTEM_HEADERS}}', systemHeaders)
} 