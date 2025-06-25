import { JobStatus } from "bull"

// Queue names as string constants
export const SCAN_VALIDATION = 'scan_validation'
export const OCR_EXTRACTION = 'ocr_extraction'
export const DATA_APPROVAL = 'data_approval'
export const INVENTORY_UPDATE = 'inventory_update'
export const INBOUND_MESSAGES = 'inbound_messages'
export const OUTBOUND_MESSAGES = 'outbound_messages'

// Bull event names as string constants
export const JOB_STATUS = {
   COMPLETED: 'completed',
   FAILED: 'failed',
   ACTIVE: 'active',
   WAITING: 'waiting',
   STALLED: 'stalled',
   PAUSED: 'paused'
} as const


