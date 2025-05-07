import { db } from '../connections/mongodb.ts'
import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'

/**
 * Process a job for data approval.
 * Here we need 3 parameters:
 *    1. Whatsapp phone to send to;
 *    2. Type: currently 'File' or 'Text'. What about file with comment??
 * Or maybe an object like this:
 *    {
 *       phone: 972541234567,
 *       file: <url>
 *    }
 * or:
 *    {
 *       phone: 972541234567,
 *       text: <some text>
 *    }
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function outboundMessagesProcessor(job: Job<JobData>): Promise<BaseJobResult> {
   log.info(`Processing data approval job: ${job.id}`)

   // Get document ID from job.id
   const docId = job.id.toString()
   const storeId = job.data.storeId

   log.info(`Document ID: ${docId}, Store ID: ${storeId}`)

   // Mock processing logic - in a real implementation, this would:
   // 1. Notify relevant users about data needing approval
   // 2. Provide interface for reviewing extracted data
   // 3. Update document status based on approval

   // Simulate processing delay
   await new Promise((resolve) => setTimeout(resolve, 1000))

   // Mock update to database
   log.info(`Updating document ${docId} status to 'pending_data_approval'`)

   return {
      success: true,
      docId,
      message: 'Data approval notification sent'
   }
} 