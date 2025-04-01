import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'

/**
 * Process a job for inventory update - simplified mock version
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function inventoryUpdateProcessor(job: Job<JobData>): Promise<BaseJobResult> {
   const docId = job.id
   const storeId = job.data.storeId
   
   log.info({ docId, storeId }, 'Processing inventory update job')

   // Simulate processing delay
   await new Promise(resolve => setTimeout(resolve, 1500))

   log.info({ docId }, 'Inventory update completed successfully')
   
   return {
      success: true,
      docId,
      message: 'Inventory successfully updated'
   }
} 