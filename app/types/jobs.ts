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
 * Interface for inbound message job data
 * Contains reference to message stored in memory
 */
export interface MessageRef {
   messageId: string
}

/**
 * Interface for inbound message job data
 */
// export interface InboundMessageData {
//    content: string | { [key: string]: any }
//    storeId: string
//    name: string
//    phone: string
//    createdAt: Date
// }

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
