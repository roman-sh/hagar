// Queue names as string constants
export const SCAN_VALIDATION = 'scan_validation'
export const DATA_EXTRACTION = 'data_extraction'
export const DATA_APPROVAL = 'data_approval'
export const INVENTORY_UPDATE = 'inventory_update'
export const INBOUND_MESSAGES = 'inbound_messages'
export const OUTBOUND_MESSAGES = 'outbound_messages'

// Document type constants
export enum DocType {
   SCAN = 'scan',
   STORE = 'store',
   PRODUCT = 'product',
   UPDATE = 'update',
   MESSAGE = 'message'
}

