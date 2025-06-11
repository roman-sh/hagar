import Bull, { Queue, Job, ProcessCallbackFunction, QueueOptions, JobStatus } from 'bull'
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
   inventoryUpdateProcessor
} from './processors/index'
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
const processorsMap: Record<QueueKey, ProcessCallbackFunction<JobData>> = {
   [SCAN_VALIDATION]: scanValidationProcessor,
   [OCR_EXTRACTION]: ocrExtractionProcessor,
   [DATA_APPROVAL]: dataApprovalProcessor,
   [INVENTORY_UPDATE]: inventoryUpdateProcessor
}

/**
 * Initialize all queues with their processors and event handlers
 */
export function initializeQueues(): void {
   log.info('Initializing queues with processors...')

   // Set up pipeline queues
   for (const [queueName, queue] of Object.entries(queuesMap)) {
      const processor = processorsMap[queueName as QueueKey]
      queue.process(100000, processor) // 100K concurrency - tested safe limit for waiting jobs
      setupQueueEventHandlers(queue, queueName)
   }

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
      const activeResult: JobRecord = {
         status: JOB_STATUS.ACTIVE,
         timestamp: new Date()
      }

      await database.recordJobProgress(job.id as string, queueName, activeResult)

      log.info(
         { jobId: job.id, queueName },
         'Job started processing'
      )
   })

}
