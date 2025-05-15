import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb.ts'
import { queuesMap } from '../queues.ts'
import { INBOUND_MESSAGES } from '../config/constants.ts'
import { ScanDocument, StoreDocument } from '../types/documents'
import { DocType } from '../config/constants.ts'
import { moveJobToDelayed } from '../services/bull.ts'


/**
 * Process a job for scan validation
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function scanValidationProcessor(
   job: Job<JobData>
): Promise<BaseJobResult> {
   const docId = job.id
   const storeId = job.data.storeId

   // Check if this is the first attempt to avoid duplicate processing
      log.info({ docId, storeId }, 'Processing scan validation job')

      // Fetch the document from db
      const collection = db.collection(storeId)
      // @ts-ignore - MongoDB typing issue with string IDs
      const scanDoc = await collection.findOne({ _id: docId }) as ScanDocument

      // Get store document to find manager phone number
      const storeDoc = await collection.findOne({
         type: DocType.STORE
      }) as unknown as StoreDocument

      // Queue the document for validation as an inbound message
      const messageId = `${storeId}:${scanDoc.filename}` // Create a meaningful message ID
      const { manager } = storeDoc

      // Create the inbound message with the PDF information
      await queuesMap[INBOUND_MESSAGES].add(
         {
            type: 'file',
            storeId,
            content: {
               filename: scanDoc.filename,
               file_id: scanDoc.fileId // OpenAI file_id from the document
            },
            sender: manager, // Include sender phone for routing responses
            source: 'scanner' // Identify this as coming from the scanner
         },
         {
            jobId: messageId // Set explicit job ID for tracking
         }
      )

      log.info({ messageId }, 'Document queued as inbound message')
      log.info({ docId, messageId }, 'Validation job awaiting user interaction')

   // Use Bull's explicit API to move the job to delayed state with a very long delay
   // This should keep it visible in the Bull UI in the "delayed" tab
   await moveJobToDelayed(job)

   // TODO: maybe save this promise to redis, and resolve it upon validation pass,
   // instead of moving a job to completed state manually
   return new Promise<BaseJobResult>(() => { })
} 

