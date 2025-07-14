import { Job } from 'bull'
import { TableData } from '../services/ocr'
import { InvoiceMeta, InventoryDocument } from './inventory.js'
import {
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   UPDATE_PREPARATION,
   INVENTORY_UPDATE,
} from '../config/constants.js'

/**
 * General Convention for Pipeline Jobs:
 * The document's `_id` from MongoDB is always passed as the `job.id`
 * when a job is added to a Bull queue (via the `jobId` option). This creates
 * a direct, traceable link between the data record and its processing job.
 */

// --- Specific Job Data Interfaces ---

/**
 * Job data for the scan validation queue.
 * This is currently a placeholder and can be expanded later.
 */
export interface ScanValidationJobData {}

/**
 * Job data for the OCR extraction queue.
 * This is currently a placeholder and can be expanded later.
 */
export interface OcrExtractionJobData {}

/**
 * Job data for the update preparation queue. It holds the processed
 * inventory document that is being prepared for confirmation.
 * It is a union of an empty object (initial state) and the full
 * document (processed state).
 */
export type UpdatePreparationJobData = {} | InventoryDocument

/**
 * Job data for the inventory update queue. 
 * This is currently a placeholder and can be expanded later.
 */
export interface InventoryUpdateJobData {}

/**
 * A map that associates each queue name with its specific job data type.
 * This is the key to achieving strong typing for queues and processors.
 */
export interface JobDataMap {
   [SCAN_VALIDATION]: ScanValidationJobData
   [OCR_EXTRACTION]: OcrExtractionJobData
   [UPDATE_PREPARATION]: UpdatePreparationJobData
   [INVENTORY_UPDATE]: InventoryUpdateJobData
}


/**
 * Interface for inbound message job data
 * Contains reference to message stored in memory
 */
export interface MessageRef {
   messageId: string
}

export type OutboundMessageJobData = {
   phone: string
   content: string | null
}

/**
 * Base result interface for job processors
 */
export interface BaseJobResult {
   success: boolean
   message: string
}


// --- Specific Job Payloads ---

export type ScanValidationJobCompletedPayload =
   InvoiceMeta & { annotation: string }

export type OcrExtractionJobCompletedPayload = {
   data: TableData[]
   /**
    * The annotation from the initial OCR review (for debugging purposes). 
    * This field is preserved from the 'waiting' state record when the 'completed'
    * state is merged into it by the `database.recordJobProgress` function.
    */
   annotation?: string
}

export type InventoryUpdateJobCompletedPayload = {
   [key: string]: any
}

export type OcrExtractionJobWaitingPayload = {
   data: TableData[]
   annotation: string
}


// --- Granular Payloads for Job States ---

export type JobFailedPayload = {
   error: string
}

export type JobWaitingPayloads =
   | OcrExtractionJobWaitingPayload
   // Future waiting payloads can be added here

export type JobCompletedPayloads =
   | ScanValidationJobCompletedPayload
   | OcrExtractionJobCompletedPayload
   | InventoryUpdateJobCompletedPayload