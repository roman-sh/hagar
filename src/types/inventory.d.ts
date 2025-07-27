import { type H } from '../config/constants'
import { type QueueKey } from '../queues-base'
import { type ProductDocument } from './documents'


/**
 * Represents a single, structured item from a supplier's document after parsing.
 * The keys are derived from the master Headers constant for consistency.
 */
export type InventoryItem = {
   [H.ROW_NUMBER]?: string
   [H.SUPPLIER_ITEM_NAME]?: string
   [H.QUANTITY]?: string
   [H.SUPPLIER_ITEM_UNIT]?: string
   [H.BARCODE]?: string
   [H.INVENTORY_ITEM_ID]?: string // Our internal product ID
   [H.INVENTORY_ITEM_NAME]?: string // Our internal product name
   [H.INVENTORY_ITEM_UNIT]?: string // Our internal product unit
   [H.MATCH_TYPE]?: MatchType | ''
   [H.PAGE_NUMBER]?: string   // metadata per item
   candidates?: ProductCandidate[] // for non-exact matches
}

/**
 * A candidate for a product match, typically from a search.
 * It's derived from the main ProductDocument to ensure consistency,
 * picking '_id', 'name' and 'unit'.
 */
export type ProductCandidate = Pick<ProductDocument,
   | '_id'
   | 'name'
   | 'unit'
   > & {
   score?: number
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

/**
 * Represents the "spreadsheet" JSON format for an inventory document.
 * This is a token-efficient format for agent interaction.
 */
export type InventorySpreadsheet = {
   meta: InventoryDocument['meta']
   header: (keyof InventoryItem)[]
   rows: (InventoryItem[keyof InventoryItem])[][]
}


export type PassArgs = {
   doc: InventoryDocument
   storeId: string
   docId: string,
   queue: QueueKey,
   target?: MatchType
}

export type MatchType = 'barcode' | 'name' | 'manual' | 'skip' | 'history'

export interface CatalogService {
   sync(storeId: string, options?: { force?: boolean }): Promise<void>
}

export interface CatalogModule {
   catalog: CatalogService
}
