import { JobStatus } from "bull"
import { InvoiceMeta } from "../types/inventory"

// Queue names as string constants
export const SCAN_VALIDATION = 'scan_validation'
export const OCR_EXTRACTION = 'ocr_extraction'
export const UPDATE_PREPARATION = 'update_preparation'
export const INVENTORY_UPDATE = 'inventory_update'
export const INBOUND_MESSAGES = 'inbound_messages'
export const OUTBOUND_MESSAGES = 'outbound_messages'

// Bull event names as string constants
export const JOB_STATUS = {
   COMPLETED: 'completed',
   FAILED: 'failed',
   ACTIVE: 'active',
   WAITING: 'waiting',
   PAUSED: 'paused',
   DELAYED: 'delayed',
} as const satisfies {
   [K in JobStatus as Uppercase<K>]: JobStatus
}

// Metadata keys as string constants
export const META_KEYS = [
   'invoiceId',
   'supplier',
   'date',
   'pages',
] as const satisfies readonly (keyof InvoiceMeta)[]

// Inventory update headers
export const H = {
   PAGE_NUMBER: 'pageNumber',
   ROW_NUMBER: 'row_number',
   SUPPLIER_ITEM_NAME: 'supplier_item_name',
   SUPPLIER_ITEM_UNIT: 'supplier_item_unit',
   QUANTITY: 'quantity',
   BARCODE: 'barcode',
   INVENTORY_ITEM_ID: 'inventory_item_id',
   INVENTORY_ITEM_NAME: 'inventory_item_name',
   INVENTORY_ITEM_UNIT: 'inventory_item_unit',
   MATCH_TYPE: 'match_type'
} as const


export const INVENTORY_UPDATE_HEADERS = Object.values(H)

export const DISPLAY_HEADERS = {
   [H.ROW_NUMBER]: '#',
   [H.SUPPLIER_ITEM_NAME]: 'פריט ספק',
   [H.INVENTORY_ITEM_NAME]: 'פריט מלאי',
   [H.QUANTITY]: 'כמות',
   [H.MATCH_TYPE]: 'אופן התאמה'
}

// ===================================================================================
// S3 Key Templates
// ===================================================================================

export const S3_MANUAL_CATALOG_KEY = 'manual-catalogs/{{storeId}}.json'


