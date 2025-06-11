import { db } from '../connections/mongodb'
import { queuesMap, QueueKey } from '../queues'
import { JOB_STATUS, SCAN_VALIDATION } from '../config/constants'
import { JobRecord, ScanDocument, StoreDocument } from '../types/documents'
import { database } from './db'
import { Job } from 'bull'
import { JobData } from '../types/jobs'

export const pipeline = {
   /**
    * Starts the first step of a processing pipeline for a new document.
    * It retrieves the store's defined pipeline and adds a job to the first queue.
    * @param {string} docId - The unique ID of the document.
    */
   start: async (docId: string) => {
      // Get the storeId from the document first
      const { storeId } = await db.collection<Pick<ScanDocument, 'storeId'>>('scans')
         // @ts-expect-error - mongo driver types issue with _id being a string
         .findOne({ _id: docId }, { projection: { storeId: 1 } })

      const store = await db
         .collection<Pick<StoreDocument, 'pipeline'>>('stores')
         .findOne({ storeId }, { projection: { pipeline: 1 } })

      const firstQueue = store.pipeline[0]
      await queuesMap[firstQueue].add({} as JobData, { jobId: docId })
      log.info(`Document ${docId} queued to ${firstQueue}`)
   },

   /**
    * Completes the current job and advances the document to the next queue in its pipeline.
    * @param {string} docId - The unique ID of the document.
    * @param {any} recordData - The data payload to be stored in the completed job record.
    */
   advance: async (docId: string, recordData: any) => {
      // 1. Find the active job across all queues
      const jobDetails = await findActiveJob(docId)
      const { job, queueName } = jobDetails!

      // 2. Mark the job as completed with final data
      const result: JobRecord = {
         status: JOB_STATUS.COMPLETED,
         timestamp: new Date(),
         data: recordData,
      }
      await job.progress(100)
      await job.moveToCompleted(result as any, true)
      await database.recordJobProgress(docId, queueName, result)

      // 3. Get the pipeline for the store
      const pipeline = await getPipeline(docId)

      // 4. Find the next queue and add the job
      const currentIndex = pipeline.findIndex((q) => q === queueName)
      const nextQ = pipeline[currentIndex + 1]

      if (nextQ) {
         await queuesMap[nextQ].add({} as JobData, { jobId: docId })
         log.info(`Document ${docId} advanced to next queue: ${nextQ}`)
      } else {
         log.info(`Document ${docId} has completed the final stage of its pipeline.`)
      }
   },
}

// --- Helper Functions ---

/**
 * Finds which Bull queue a job belongs to by checking all registered queues.
 * This is necessary because Bull doesn't have a global "find job" method.
 * @param {string} jobId The ID of the job to find.
 * @returns {Promise<{job: Job, queueName: QueueKey}>}
 */
async function findActiveJob(jobId: string): Promise<{ job: Job; queueName: QueueKey }> {
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

/**
 * Retrieves the processing pipeline array from a store,
 * found via the scan document ID. Uses an efficient aggregation.
 * @param {string} docId The ID of the scan document.
 * @returns {Promise<QueueKey[]>} The pipeline array.
 */
async function getPipeline(docId: string): Promise<QueueKey[]> {
   const aggregationResult = await db
      .collection('scans')
      .aggregate<Pick<StoreDocument, 'pipeline'>>([
         { $match: { _id: docId } },
         {
            $lookup: {
               from: 'stores',
               localField: 'storeId',
               foreignField: 'storeId',
               as: 'store',
            },
         },
         {
            $project: {
               _id: 0,
               pipeline: { $first: '$store.pipeline' },
            },
         },
      ])
      .toArray()

   return aggregationResult[0].pipeline
}