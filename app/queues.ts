import Bull, { Queue, Job, ProcessCallbackFunction, QueueOptions } from 'bull'
import BeeQueue from 'bee-queue'
import {
   SCAN_VALIDATION,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE,
   OUTBOUND_MESSAGES
} from './config/constants'
import { JobData, BaseJobResult, OutboundMessageJobData } from './types/jobs'
import {
   scanValidationProcessor,
   dataExtractionProcessor,
   dataApprovalProcessor,
   inventoryUpdateProcessor
} from './processors/index'
import { outboundMessagesProcessor } from './processors/outbound-messages-bee'


// Define separate queue categories
export type QueueKey =
   | typeof SCAN_VALIDATION
   | typeof DATA_EXTRACTION
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
   [DATA_EXTRACTION]: new Bull(DATA_EXTRACTION, queueConfig),
   [DATA_APPROVAL]: new Bull(DATA_APPROVAL, queueConfig),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE, queueConfig)
}

// Outbound messages Bee queue (single queue with concurrency 1 for rate limiting)
export const outboundMessagesQueue = new BeeQueue<OutboundMessageJobData>(OUTBOUND_MESSAGES)

// Separate processor maps
const processorsMap: Record<QueueKey, ProcessCallbackFunction<JobData>> = {
   [SCAN_VALIDATION]: scanValidationProcessor,
   [DATA_EXTRACTION]: dataExtractionProcessor,
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
   // Log when jobs are completed successfully
   queue.on('completed', (job: Job<any>, result: BaseJobResult) => {
      log.info(
         { jobId: job.id, queueName, result },
         'Job completed successfully'
      )
   })

   // Log when jobs fail
   queue.on('failed', (job: Job<any>, error: Error) => {
      log.error(
         { jobId: job.id, queueName, errorMessage: error.message },
         'Job failed'
      )
   })

   // Log when jobs are stalled (worker crashed or lost connection)
   queue.on('stalled', (job: Job<any>) => {
      // TODO: if we set stalledInterval to 1 day, we need to handle reminders here
      log.warn({ jobId: job.id, queueName }, 'Job has stalled')
   })
}
