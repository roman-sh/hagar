import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'

/**
 * Process a job for inventory update - simplified mock version
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function inventoryUpdateProcessor(
   job: Job<JobData>
): Promise<BaseJobResult> {
   const docId = job.id

   log.info({ docId }, 'Processing inventory update job')

   // Simulate processing delay
   await new Promise((resolve) => setTimeout(resolve, 15000))

   log.info({ docId }, 'Inventory update completed successfully')

   return {
      success: true,
      message: 'Inventory successfully updated'
   }
}
