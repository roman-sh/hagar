import Bull, { Queue, Job, ProcessCallbackFunction, QueueOptions } from 'bull'
import BeeQueue from 'bee-queue'
import {
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE,
   OUTBOUND_MESSAGES,
   JOB_STATUS,
} from './config/constants'
import { JobData, BaseJobResult, OutboundMessageJobData } from './types/jobs'
import {
   scanValidationProcessor,
   ocrExtractionProcessor,
   dataApprovalProcessor,
} from './processors'
import { inventoryProcessors } from './processors/inventory-update'
import { outboundMessagesProcessor } from './processors/outbound-messages-bee'
import { database } from './services/db'
import { JobRecord } from './types/documents'


// Define separate queue categories
export type QueueKey =
   | typeof SCAN_VALIDATION
   | typeof OCR_EXTRACTION
   | typeof DATA_APPROVAL
   | typeof INVENTORY_UPDATE


// Pipeline queue configuration
const queueConfig: QueueOptions = {
   settings: {
      stalledInterval: 0, // never check for stalled jobs
      // stalledInterval: 24 * 60 * 60 * 1000, // 1 day - check for stalled jobs after 24 hours
   },
   defaultJobOptions: {
      attempts: 1, // Only try once, no retries
   }
}

// Separate queue maps
export const queuesMap: Record<QueueKey, Queue<JobData>> = {
   [SCAN_VALIDATION]: new Bull(SCAN_VALIDATION, queueConfig),
   [OCR_EXTRACTION]: new Bull(OCR_EXTRACTION, queueConfig),
   [DATA_APPROVAL]: new Bull(DATA_APPROVAL, queueConfig),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE, queueConfig)
}

// Outbound messages Bee queue (single queue with concurrency 1 for rate limiting)
export const outboundMessagesQueue = new BeeQueue<OutboundMessageJobData>(OUTBOUND_MESSAGES)

// Separate processor maps
const processorsMap: Record<
   Exclude<QueueKey, typeof INVENTORY_UPDATE>,
   ProcessCallbackFunction<JobData>
> = {
   [SCAN_VALIDATION]: scanValidationProcessor,
   [OCR_EXTRACTION]: ocrExtractionProcessor,
   [DATA_APPROVAL]: dataApprovalProcessor,
}

/**
 * Initialize all queues with their processors and event handlers
 */
export function initializeQueues(): void {
   log.info('Initializing queues with processors...')

   // Set up pipeline queues with static, unnamed processors
   for (const queueName of Object.keys(processorsMap) as Array<keyof typeof processorsMap>) {
      const queue = queuesMap[queueName]
      const processor = processorsMap[queueName]
      queue.process(100000, processor)
      setupQueueEventHandlers(queue, queueName)
   }

   // Register named processors for the inventory update queue
   const inventoryUpdateQueue = queuesMap[INVENTORY_UPDATE]
   for (const [name, processor] of Object.entries(inventoryProcessors)) {
      inventoryUpdateQueue.process(name, 100000, processor)
      log.info(`Registered inventory update processor: '${name}'`)
   }
   setupQueueEventHandlers(inventoryUpdateQueue, INVENTORY_UPDATE)

   // Set up outbound message Bee queue
   outboundMessagesQueue.process(1, outboundMessagesProcessor)

   log.info('All queues initialized successfully')
}

/**
 * Set up event handlers for a queue
 * @param queue - The Bull queue
 * @param queueName - Name of the queue
 */
function setupQueueEventHandlers(
   queue: Queue<any>,
   queueName: string
): void {

   // Log when jobs become active (start processing)
   queue.on(JOB_STATUS.ACTIVE, async (job: Job<any>) => {
      // Update document to mark job as active/processing
      await database.recordJobProgress({
         jobId: job.id as string,
         queueName,
         status: JOB_STATUS.ACTIVE,
      })

      log.info(
         { jobId: job.id, queueName },
         'Job started processing'
      )
   })

   // Log when jobs are completed
   queue.on('global:completed', (jobId: string, result: string) => {
      let parsedResult: any
      try {
         parsedResult = JSON.parse(result)
      }
      catch (e) {
         parsedResult = result
      }
      log.info(
         { jobId, queueName, result: parsedResult },
         'Job completed successfully'
      )
   })

   // Log when jobs fail
   queue.on(JOB_STATUS.FAILED, async (job: Job<any>, error: Error) => {
      // Record the failure in the database

      await database.recordJobProgress({
         jobId: job.id as string,
         queueName,
         status: JOB_STATUS.FAILED,
         error: error.message,
      })

      log.error(
         error,
         `Job ${job.id} failed in queue ${queueName}`
      )
   })

}
