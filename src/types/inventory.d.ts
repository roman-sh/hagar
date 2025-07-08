import { type ScanValidationJobCompletedPayload } from './jobs'
import { type H } from '../config/constants'


/**
 * Represents a single, structured item from a supplier's document after parsing.
 * The keys are derived from the master Headers constant for consistency.
 */
export type InventoryItem = {
   [H.ROW_NUMBER]?: string
   [H.SUPPLIER_ITEM_NAME]?: string
   [H.QUANTITY]?: number
   [H.UNIT]?: string
   [H.BARCODE]?: string
   [H.INVENTORY_ITEM_ID]?: string // Our internal product ID
   [H.INVENTORY_ITEM_NAME]?: string // Our internal product name
   [H.MATCH_TYPE]?: MatchType
   candidates?: { productId: string; name: string; unit?: string }[] // for non-exact matches
   pageNumber?: number   // metadata per item
}

/**
 * Represents an entire inventory document, including metadata and a list of structured items.
 */
export type InventoryDocument = {
   meta: InvoiceMeta
   items: InventoryItem[]
}

export type InvoiceMeta = {
   invoiceId: string
   supplier: string
   date: string
   pages: number
}

export type PassArgs = {
   doc: InventoryDocument
   storeId: string
   docId: string
   passName?: MatchType
}

export type MatchType = 'barcode' | 'barcode-collision' | 'vector' | 'regex'
