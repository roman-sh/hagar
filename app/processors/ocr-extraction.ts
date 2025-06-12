import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb'
import { JobRecord, MessageDocument, ScanDocument, StoreDocument } from '../types/documents'
import { ocr } from '../services/ocr'
import { OCR_EXTRACTION, JOB_STATUS, DocType } from '../config/constants'
import { database } from '../services/db'
import { gpt } from '../services/gpt'
import { OptionalId } from 'mongodb'

/**
 * Process a job for data extraction from a scanned document
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function ocrExtractionProcessor(
   job: Job<JobData>
): Promise<BaseJobResult> {
   const docId = job.id as string

   // 1. Get all necessary scan and store details in one call
   const { storeId, url, phone } = await database.getScanAndStoreDetails(docId)

   // 2. Call the OCR service with the URL
   const extractedData = await ocr.extractInvoiceDataFromUrl(url)

   // 3. Save extracted data to the document
   const jobRecord: JobRecord = {
      // the job is actually active, but we wait for gpt to finalize
      status: JOB_STATUS.WAITING,
      timestamp: new Date(),
      data: extractedData,
   }
   await db
      .collection<ScanDocument>('scans')
      .updateOne({ _id: docId }, { $set: { [OCR_EXTRACTION]: jobRecord } })

   // 4. Send message to GPT to trigger data approval flow
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone: phone,
      name: 'app',
      content: {
         action: 'review_ocr_data',
         docId,
         extractedData,
      },
      storeId: storeId,
      createdAt: new Date(),
   })

   // 5. Trigger GPT processing
   gpt.process({
      phone: phone,
      storeId: storeId,
   })

   // 6. Set progress to 50% to indicate readiness for user validation
   await job.progress(50)

   // Job will hang until handled by a tool
   return new Promise(() => {})
} 

