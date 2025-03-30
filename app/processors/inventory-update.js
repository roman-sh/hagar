import db from '../db/connection.js'
import path from 'path'

/**
 * Process a job for inventory update
 * @param {Object} job - The Bull job object
 * @returns {Promise<Object>} The processing result
 */
export async function inventoryUpdateProcessor(job) {
   try {
      const docId = job.id
      log.info({ docId }, 'Processing inventory update job')

      // Get the document from the database
      const doc = await db.get(docId)

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
         const result = await updateInventory(doc, job)

         log.info(
            { docId, systemName },
            'Inventory update completed successfully'
         )
         return {
            success: true,
            docId,
            systemName,
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
            `Inventory system processor '${systemName}' not available: ${importError.message}`
         )
      }
   } catch (error) {
      const docId = job.id
      log.error({ err: error, docId }, 'Error processing inventory update')
      throw error // Re-throw so Bull can handle retries
   }
}
