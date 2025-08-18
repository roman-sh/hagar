import { ChatCompletionTool } from 'openai/resources'
import { pipeline, findActiveJob } from '../services/pipeline'
import { database } from '../services/db'
import { db } from '../connections/mongodb'
import { InventoryDocument, InventoryItem, HistoryItem } from '../types/inventory'
import { DocType, UpdateDocument } from '../types/documents'


export const finalizeUpdatePreparationSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeUpdatePreparation',
      description: 'Finalizes the inventory update preparation stage after all corrections have been applied and confirmed.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being finalized.',
            },
         },
         required: ['docId'],
      },
   },
}

interface FinalizeUpdatePreparationArgs {
   docId: string
}

/**
 * Finalizes the update preparation stage.
 * This involves saving the final inventory document for learning purposes
 * and advancing the job to the next stage in the pipeline.
 * @param {FinalizeUpdatePreparationArgs} args - The arguments for the function.
 * @returns {Promise<object>} An object confirming the action and indicating the next stage.
 */
export async function finalizeUpdatePreparation({ docId }: FinalizeUpdatePreparationArgs) {
   try {
      const { job } = await findActiveJob(docId)
      const doc = job.data as InventoryDocument
      const store = await database.getStoreByDocId(docId)

      // Create the document to be saved in the 'updates' collection
      const updateDoc: UpdateDocument = {
         _id: docId,
         type: DocType.UPDATE,
         storeId: store.storeId,
         createdAt: new Date(),
         ...doc,
      }

      // Save the final, approved document for future learning/analysis
      await db.collection<UpdateDocument>('updates').insertOne(updateDoc)
      log.info({ docId }, 'Saved final inventory document to updates collection.')

      // Now, create the flattened history items from this document for efficient searching.
      await createHistoryItems(updateDoc)

      // Clear the job's data before advancing to avoid duplication.
      // Bull will add job result (inventory document) automatically
      await job.update({})

      // Advance the job to the next stage, passing the finalized document
      // for auditing and to be used by the next processor.
      const nextStage = await pipeline.advance(docId, { data: doc })

      return {
         success: true,
         message: `Inventory update preparation for document ${docId} has been finalized.`,
         nextStage,
      }
   }
   catch (error) {
      const errorMessage = `Failed to finalize update preparation for docId ${docId}.`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`,
      }
   }
}

/**
 * Creates and saves flattened history items from a finalized update document.
 * This denormalizes the data for efficient fuzzy searching in the future.
 * @param {UpdateDocument} updateDoc - The finalized update document.
 */
async function createHistoryItems(updateDoc: UpdateDocument): Promise<void> {
   if (!updateDoc.items?.length) return // No items to process

   try {
      const historyCollection = db.collection<HistoryItem>('history')

      const historyItems = updateDoc.items
         .map((item, index): HistoryItem => ({
            ...item,
            storeId: updateDoc.storeId,
            createdAt: updateDoc.createdAt,
            parentDocId: updateDoc._id,
            // Use the array index for a guaranteed clean and unique _id suffix.
            _id: `${updateDoc._id}-${index + 1}`   // use 1-based index
         }))

      // Use a bulk upsert operation for idempotency. This ensures that if the
      // job is retried, we will update existing history items instead of
      // throwing a duplicate key error.
      const bulkOps = historyItems.map(item => ({
         updateOne: {
            filter: { _id: item._id },
            update: { $set: item },
            upsert: true
         }
      }))
      await historyCollection.bulkWrite(bulkOps)
      log.info({ docId: updateDoc._id, count: historyItems.length }, 'Saved history items to history collection.')
   } catch (error) {
      log.error(error, `Failed to create history items for docId ${updateDoc._id}.`)
      // We don't re-throw the error, as failing to create history items
      // should not block the main inventory processing pipeline.
   }
} 