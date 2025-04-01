import Bull, { Queue, Job, ProcessCallbackFunction } from 'bull'
import {
   SCAN_APPROVAL,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE
} from './config/constants.ts'
import { JobData, BaseJobResult } from './types/jobs'

import {
   scanApprovalProcessor,
   dataExtractionProcessor,
   dataApprovalProcessor,
   inventoryUpdateProcessor
} from './processors/index.ts'

// Define a type for our queue keys
export type QueueKey =
   typeof SCAN_APPROVAL |
   typeof DATA_EXTRACTION |
   typeof DATA_APPROVAL |
   typeof INVENTORY_UPDATE

// Create the queues with proper job data typing
export const queuesMap: Record<QueueKey, Queue<JobData>> = {
   [SCAN_APPROVAL]: new Bull(SCAN_APPROVAL),
   [DATA_EXTRACTION]: new Bull(DATA_EXTRACTION),
   [DATA_APPROVAL]: new Bull(DATA_APPROVAL),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE)
}

// Map of queue names to their processors
export const processorsMap: Record<QueueKey, ProcessCallbackFunction<JobData>> = {
   [SCAN_APPROVAL]: scanApprovalProcessor,
   [DATA_EXTRACTION]: dataExtractionProcessor,
   [DATA_APPROVAL]: dataApprovalProcessor,
   [INVENTORY_UPDATE]: inventoryUpdateProcessor
}

/**
 * Initialize all queues with their processors and event handlers
 */
export function initializeQueues(): void {
   log.info('Initializing queues with processors...')

   // Set up each queue with its processor
   for (const [queueName, queue] of Object.entries(queuesMap)) {
      const processor = processorsMap[queueName as QueueKey]

      // Process jobs one at a time
      queue.process(processor)
      log.info(`Queue ${queueName} initialized with processor`)
      
      // Set up event handlers
      setupQueueEventHandlers(queue, queueName)
   }

   log.info('All queues initialized successfully')
}

/**
 * Set up event handlers for a queue
 * @param queue - The Bull queue
 * @param queueName - Name of the queue
 */
function setupQueueEventHandlers(queue: Queue<JobData>, queueName: string): void {
   // Log when jobs are completed successfully
   queue.on('completed', (job: Job<JobData>, result: BaseJobResult) => {
      log.info(
         { jobId: job.id, queueName, result },
         'Job completed successfully'
      )
   })

   // Log when jobs fail
   queue.on('failed', (job: Job<JobData>, error: Error) => {
      log.error(
         { jobId: job.id, queueName, errorMessage: error.message },
         'Job failed'
      )
   })

   // Log when jobs are stalled (worker crashed or lost connection)
   queue.on('stalled', (job: Job<JobData>) => {
      log.warn({ jobId: job.id, queueName }, 'Job has stalled')
   })
}