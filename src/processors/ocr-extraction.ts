import { Job } from 'bull'
import { OcrExtractionJobData, BaseJobResult } from '../types/jobs.js'
import { db } from '../connections/mongodb'
import { JobRecord, MessageDocument, ScanDocument, DocType } from '../types/documents'
import { ocr, OcrReviewResult } from '../services/ocr'
import { OCR_EXTRACTION } from '../config/constants'
import { database } from '../services/db'
import { gpt } from '../services/gpt'
import { OptionalId } from 'mongodb'
import { JOB_STATUS } from '../config/constants'
import { QueueKey } from '../queues-base.js'

/**
 * Process a job for data extraction from a scanned document
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function ocrExtractionProcessor(
   job: Job<OcrExtractionJobData>
): Promise<BaseJobResult> {
   const docId = job.id as string

   // 1. Get all necessary scan and store details
   const { storeId, url, phone } = await database.getScanAndStoreDetails(docId)

   // 2. Call the OCR service to get raw data
   const rawData = await ocr.extractInvoiceDataFromUrl(url)

   // Save extracted raw data as a job artefact
   await database.saveArtefact({
      docId,
      queue: job.queue.name as QueueKey,
      key: 'extracted-data-from-azure-ocr',
      data: rawData,
   })

   await job.progress(33)

   // 3. Call the review service to get corrected data and annotation
   const { data: reviewedData, annotation } = await ocr.review(rawData)

   // Save data after o3 review / modification as a job artefact
   await database.saveArtefact({
      docId,
      queue: job.queue.name as QueueKey,
      key: 'data-after-o3-review',
      data: { data: reviewedData, annotation },
      flatten: true,
   })

   // TODO: remove this. This data is now available as a job artefact.
   // 4. Save the final reviewed data and annotation
   const reviewedRecord: JobRecord & { annotation: string } = {
      status: JOB_STATUS.WAITING, // The job is now waiting for user/AI validation
      timestamp: new Date(),
      data: reviewedData,
      annotation: annotation,
   }
   await db
      .collection<ScanDocument>('scans')
      .updateOne({ _id: docId }, { $set: { [OCR_EXTRACTION]: reviewedRecord } })

   // 5. Send annotation to GPT to trigger the review flow
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      name: 'app',
      content: {
         action: 'review_ocr_annotation',
         docId,
         annotation,
      },
      storeId,
      createdAt: new Date(),
   })

   // 6. Trigger GPT processing
   gpt.process({
      phone: phone,
      storeId: storeId,
   })

   // 7. Set progress to 2/3 to indicate readiness for AI validation
   await job.progress(66)

   // Job will hang until handled by a tool
   return new Promise(() => {})
} 

