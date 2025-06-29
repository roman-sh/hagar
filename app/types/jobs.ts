import { Job } from 'bull'
import { TableData } from '../services/ocr'

/**
 * Common job data interface used across all queue processors
 *
 * Convention:
 * - Document ID is passed as job.id (via options.jobId when adding a job)
 * - Each job also requires a storeId to identify which store the document belongs to
 */
export interface JobData {
   storeId: string
   [key: string]: any // Additional properties specific to certain job types
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

export type ScanValidationJobCompletedPayload = {
   invoiceId: string
   supplier: string
   date: string
   pages: number
   annotation: string
}

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