import { Job } from 'bull'

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
 * Base result interface for job processors
 */
export interface BaseJobResult {
   success: boolean
   docId: string | number // Document ID (matches job.id)
   message: string
}
