import { queuesMap, QueueKey } from '../queues-base'
import { INVENTORY_UPDATE, JOB_STATUS } from '../config/constants'
import { JobRecord } from '../types/documents'
import { database } from './db'
import { Job } from 'bull'

export const pipeline = {
   /**
    * Starts the first step of a processing pipeline for a new document.
    * It retrieves the store's defined pipeline and adds a job to the first queue.
    * @param {string} docId - The unique ID of the document.
    */
   start: async (docId: string) => {
      const { pipeline } = await database.getStoreByDocId(docId)
      const firstQueue = pipeline[0] as QueueKey
      await enqueueJob(docId, firstQueue, 'queued')
   },

   /**
    * Completes the current job and advances the document to the next queue in its pipeline.
    * @param {string} docId - The unique ID of the document.
    * @param {any} recordData - The data payload to be stored in the completed job record.
    */
   advance: async (docId: string, recordData: any) => {
      // 1. Find the active job across all queues
      const { job, queueName } = await findActiveJob(docId)

      // 2. Mark the job as completed with final data
      const result: JobRecord = {
         status: JOB_STATUS.COMPLETED,
         ...recordData,
      }

      await job.progress(100)

      // The `true` argument sets `ignoreLock`. This is essential because our processors
      // hang and hold a lock on the job. `ignoreLock: true` allows this external
      // `advance` function to override the lock and forcibly mark the job as
      // completed, which is the core of our tool-driven workflow.
      await job.moveToCompleted(result as any, true)

      await database.recordJobProgress({
         jobId: docId,
         queueName,
         status: JOB_STATUS.COMPLETED,
         ...recordData,
      })

      // 3. Get the pipeline for the store
      const { pipeline } = await database.getStoreByDocId(docId)

      // 4. Find the next queue and add the job
      const currentIndex = pipeline.findIndex((q) => q === queueName)
      const nextQueue = pipeline[currentIndex + 1]

      if (nextQueue) {
         await enqueueJob(docId, nextQueue, 'advanced')
         return nextQueue
      } else {
         log.info(
            `Document ${docId} has completed the final stage of its pipeline.`
         )
         return null
      }
   },
}

// --- Helper Functions ---

/**
 * Adds a job to the specified queue, handling named processors for INVENTORY_UPDATE.
 * @param docId The document ID.
 * @param queueName The name of the queue to add the job to.
 * @param action The type of action for logging purposes.
 */
async function enqueueJob(
   docId: string,
   queueName: QueueKey,
   action: 'queued' | 'advanced'
) {
   const logPrefix =
      action === 'queued'
         ? 'queued to'
         : 'advanced to'

   await queuesMap[queueName].add({}, { jobId: docId })
   log.info(`Document ${docId} ${logPrefix} ${queueName}`)
}

/**
 * Finds which Bull queue a job belongs to by checking all registered queues.
 * This is necessary because Bull doesn't have a global "find job" method.
 * @param {string} jobId The ID of the job to find.
 * @returns {Promise<{job: Job, queueName: QueueKey}>}
 */
export async function findActiveJob(
   jobId: string
): Promise<{ job: Job; queueName: QueueKey }> {
   for (const queueName in queuesMap) {
      const qk = queueName as QueueKey
      const queue = queuesMap[qk]
      const job = await queue.getJob(jobId)

      if (job && (await job.isActive())) {
         return { job, queueName: qk }
      }
   }
   throw new Error(`Could not find an active job with ID: ${jobId}`)
}