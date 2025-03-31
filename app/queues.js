import Bull from 'bull'
import {
   SCAN_APPROVAL,
   DATA_EXTRACTION,
   DATA_APPROVAL,
   INVENTORY_UPDATE
} from './config/constants.js'

import {
   scanApprovalProcessor,
   dataExtractionProcessor,
   dataApprovalProcessor,
   inventoryUpdateProcessor
} from './processors/index.js'

// Create the queues
export const queuesMap = {
   [SCAN_APPROVAL]: new Bull(SCAN_APPROVAL),
   [DATA_EXTRACTION]: new Bull(DATA_EXTRACTION),
   [DATA_APPROVAL]: new Bull(DATA_APPROVAL),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE)
}

// Map of queue names to their processors
export const processorsMap = {
   [SCAN_APPROVAL]: scanApprovalProcessor,
   [DATA_EXTRACTION]: dataExtractionProcessor,
   [DATA_APPROVAL]: dataApprovalProcessor,
   [INVENTORY_UPDATE]: inventoryUpdateProcessor
}

/**
 * Initialize all queues with their processors and event handlers
 */
export function initializeQueues() {
   log.info('Initializing queues with processors...')

   // Set up each queue with its processor
   for (const [queueName, queue] of Object.entries(queuesMap)) {
      const processor = processorsMap[queueName]

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
 * @param {Object} queue - The Bull queue
 * @param {string} queueName - Name of the queue
 */
function setupQueueEventHandlers(queue, queueName) {
   // Log when jobs are completed successfully
   queue.on('completed', (job, result) => {
      log.info(
         { jobId: job.id, queueName, result },
         'Job completed successfully'
      )
   })

   // Log when jobs fail
   queue.on('failed', (job, error) => {
      log.error(
         { jobId: job.id, queueName, errorMessage: error.message },
         'Job failed'
      )
   })

   // Log when jobs are stalled (worker crashed or lost connection)
   queue.on('stalled', (job) => {
      log.warn({ jobId: job.id, queueName }, 'Job has stalled')
   })
}
