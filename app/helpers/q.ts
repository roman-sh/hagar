import { db } from '../connections/mongodb'
import { queuesMap, QueueKey } from '../queues'
import { StoreDocument } from '../types/documents'
import { JobData } from '../types/jobs'
import { DocType } from '../config/constants'

/**
 * Queue a document to the next processing step
 *
 * @param storeId - The store identifier
 * @param docId - The document identifier (will be used as job ID)
 * @param currentQ - The current queue the document is in
 * @returns Promise<void>
 */
export const q = async (
   storeId: string,
   docId: string,
   currentQ: QueueKey | null
): Promise<void> => {
   // Find the store document with its pipeline
   const store = await db
      .collection('stores')
      .findOne(
         { storeId }, { projection: { pipeline: 1 } }
      ) as unknown as StoreDocument

   // Use non-null assertion and type assertion
   const pipeline = store.pipeline

   // Find next queue in the pipeline
   const idx = pipeline.findIndex((q) => q === currentQ)
   const nextQ = pipeline[idx + 1]

   // If there's a next queue, add document to it
   if (nextQ) {
      await queuesMap[nextQ].add({ storeId } as JobData, { jobId: docId })

      log.info(`Document ${docId} queued to ${nextQ}`)
   }
}
