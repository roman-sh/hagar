import { ChatCompletionTool } from 'openai/resources'
import { pipeline, findActiveJob } from '../services/pipeline'
import { database } from '../services/db'
import { db } from '../connections/mongodb'
import { InventoryDocument } from '../types/inventory'
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