import Bull, { Queue, QueueOptions } from 'bull'
import BeeQueue from 'bee-queue'
import {
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   UPDATE_PREPARATION,
   INVENTORY_UPDATE,
   OUTBOUND_MESSAGES,
} from './config/constants'
import { JobDataMap, OutboundMessageJobData } from './types/jobs.js'

// Define separate queue categories
export type QueueKey =
   | typeof SCAN_VALIDATION
   | typeof OCR_EXTRACTION
   | typeof UPDATE_PREPARATION
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
export const queuesMap: { [K in QueueKey]: Queue<JobDataMap[K]> } = {
   [SCAN_VALIDATION]: new Bull(SCAN_VALIDATION, queueConfig),
   [OCR_EXTRACTION]: new Bull(OCR_EXTRACTION, queueConfig),
   [UPDATE_PREPARATION]: new Bull(UPDATE_PREPARATION, queueConfig),
   [INVENTORY_UPDATE]: new Bull(INVENTORY_UPDATE, queueConfig)
}

// Outbound messages Bee queue (single queue with concurrency 1 for rate limiting)
export const outboundMessagesQueue = new BeeQueue<OutboundMessageJobData>(OUTBOUND_MESSAGES) 