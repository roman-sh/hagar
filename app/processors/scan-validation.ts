import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'

/**
 * Process a job for scan approval
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function scanValidationProcessor(job: Job<JobData>): Promise<BaseJobResult> {
   // Get document ID from job.id
   const docId = job.id
   const storeId = job.data.storeId

   log.info({ docId, storeId }, 'Processing scan validation job')

   /**
    * Mock processing logic - in a real implementation, this would:
    * 1. Send a received file to manager's whatsapp.
    *    Probably no need to keep history since history is for ai, and ai gonna get the file in next step.
    *    So just sending the file to whatsapp. Mm, maybe we need to use queue here? 
    *    We can queues for sending to whatsapp, since we do not need generally handle history here.
    *    The history should be kept when ai sends to whatsapp, and this could be done before sending to queue.
    * 2. Send the file to ai for validation.
    *    Here we need to upload the file to openai to get file reference (fileId).
    *    Then we pass the file from role:user, preceeding it with system message for this step
    */
   // Mock processing logic - in a real implementation, this would:
   // 1. Send a received file to manager's whatsapp
   // 2. Send the file to ai for validation

   // Simulate processing delay
   await new Promise((resolve) => setTimeout(resolve, 1000))

   log.info({ docId }, 'Document scan validation process completed')

   return {
      success: true,
      docId,
      message: 'Scan validation completed'
   }
} 