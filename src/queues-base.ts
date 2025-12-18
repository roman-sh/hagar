import Bull, { Queue, QueueOptions } from 'bull'
import {
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   UPDATE_PREPARATION,
   INVENTORY_UPDATE,
   EXCEL_EXPORT,
   OUTBOUND_MESSAGES,
} from './config/constants'
import { JobDataMap, OutboundMessageJobData } from './types/jobs.js'

// Define separate queue categories
export type QueueKey =
   | typeof SCAN_VALIDATION
   | typeof OCR_EXTRACTION
   | typeof UPDATE_PREPARATION
   | typeof INVENTORY_UPDATE
   | typeof EXCEL_EXPORT


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
export const queuesMap: { [K in QueueKey]: Queue<JobDataMap[K]> } = {
   [SCAN_VALIDATION]: new Bull(SCAN_VALIDATION, queueConfig),
   [OCR_EXTRACTION]: new Bull(OCR_EXTRACTION, queueConfig),
   [UPDATE_PREPARATION]: new Bull(UPDATE_PREPARATION, queueConfig),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE, queueConfig),
   [EXCEL_EXPORT]: new Bull(EXCEL_EXPORT, queueConfig),
}

// Outbound messages queue, now using Bull for its event model.
// Kept separate from the pipeline queues. Concurrency is set in the processor.
export const outboundMessagesQueue = new Bull<OutboundMessageJobData>(OUTBOUND_MESSAGES) 