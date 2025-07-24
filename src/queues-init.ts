import { Job, ProcessCallbackFunction, Queue } from 'bull'
import {
   JOB_STATUS,
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   UPDATE_PREPARATION,
   INVENTORY_UPDATE,
} from './config/constants'
import { JobDataMap } from './types/jobs.js'
import {
   scanValidationProcessor,
   ocrExtractionProcessor,
   updatePreparationProcessor,
   inventoryUpdateProcessor,
} from './processors'
import { outboundMessagesProcessor } from './processors/outbound-messages-bee'
import { database } from './services/db'
import { queuesMap, outboundMessagesQueue, QueueKey } from './queues-base'


// We use a very high concurrency to allow jobs
// to await for user interaction and not to block the pipeline.
const PIPELINE_QUEUE_CONCURRENCY = 100000


// Separate processor maps
const processorsMap: {
   [K in QueueKey]: ProcessCallbackFunction<JobDataMap[K]>;
} = {
   [SCAN_VALIDATION]: scanValidationProcessor,
   [OCR_EXTRACTION]: ocrExtractionProcessor,
   [UPDATE_PREPARATION]: updatePreparationProcessor,
   [INVENTORY_UPDATE]: inventoryUpdateProcessor,
}

/**
 * Initialize all queues with their processors and event handlers
 */
export function initializeQueues(): void {
   log.info('Initializing queues with processors...')

   // Set up pipeline queues with static, unnamed processors
   for (const queueName of Object.keys(processorsMap) as QueueKey[]) {
      setupQueue(queueName)
   }

   // Set up outbound message Bee queue
   outboundMessagesQueue.process(1, outboundMessagesProcessor)

   log.info('All queues initialized successfully')
}

function setupQueue<K extends QueueKey>(queueName: K) {
   const queue = queuesMap[queueName]
   const processor = processorsMap[queueName]
   queue.process(PIPELINE_QUEUE_CONCURRENCY, processor)
   setupQueueEventHandlers(queue, queueName)
}

/**
 * Set up event handlers for a queue
 * @param queue - The Bull queue
 * @param queueName - Name of the queue
 */
function setupQueueEventHandlers(
   queue: Queue<any>,
   queueName: QueueKey
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
         { jobId },
         `${queueName.toUpperCase()}: Job completed successfully`
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
