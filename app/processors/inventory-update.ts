import { db } from '../connections/mongodb.ts'
import { Job } from 'bull'
import { ObjectId } from 'mongodb'
import { JobData, BaseJobResult } from '../types/jobs'

interface InventoryDoc {
   _id: string | ObjectId;
   updateProcessor?: string;
   [key: string]: any;
}

interface UpdateResult {
   [key: string]: any;
}

interface InventoryJobResult extends BaseJobResult {
   systemName: string;
   [key: string]: any;
}

/**
 * Process a job for inventory update
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function inventoryUpdateProcessor(job: Job<JobData>): Promise<InventoryJobResult> {
   try {
      // Get document ID from job.id
      const docId = job.id
      const storeId = job.data.storeId
      
      log.info({ docId, storeId }, 'Processing inventory update job')

      // Get the document from the database - using proper MongoDB API
      // Assuming documents are stored in a collection matching the storeId
      const doc = await db.collection(storeId).findOne({ _id: new ObjectId(docId.toString()) }) as InventoryDoc | null
      
      if (!doc) {
         throw new Error(`Document not found for id: ${docId}`)
      }

      // Determine which inventory system processor to use
      // Default to 'rexail' if not specified
      const systemName = doc.updateProcessor || 'rexail'

      log.info({ docId, systemName }, 'Using inventory system processor')

      try {
         // Dynamically import the processor module
         const processorModule = await import(
            `./inventory-update/${systemName}.js`
         )

         // Get the update function - assume each module exports updateInventory
         const { updateInventory } = processorModule

         if (!updateInventory || typeof updateInventory !== 'function') {
            throw new Error(
               `Invalid processor module for system: ${systemName}`
            )
         }

         // Call the system-specific inventory update function
         const result = await updateInventory(doc, job) as UpdateResult

         log.info(
            { docId, systemName },
            'Inventory update completed successfully'
         )
         return {
            success: true,
            docId,
            systemName,
            message: 'Inventory successfully updated',
            ...result
         }
      } catch (importError) {
         // Handle case where the processor module doesn't exist
         log.error(
            {
               err: importError,
               docId,
               systemName
            },
            `Failed to load inventory processor for system: ${systemName}`
         )

         throw new Error(
            `Inventory system processor '${systemName}' not available: ${importError instanceof Error ? importError.message : String(importError)}`
         )
      }
   } catch (error) {
      const docId = job.id
      log.error({ err: error, docId }, 'Error processing inventory update')
      throw error // Re-throw so Bull can handle retries
   }
} 