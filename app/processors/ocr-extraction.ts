import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb'
import { JobRecord, ScanDocument } from '../types/documents'
import { ocr } from '../services/ocr'
import { OCR_EXTRACTION, JOB_STATUS } from '../config/constants'


/**
 * Process a job for data extraction from a scanned document
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function ocrExtractionProcessor(
   job: Job<JobData>
): Promise<BaseJobResult> {
   const docId = job.id as string

   // 1. Get the ScanDocument to find the public URL
   const { url } = await db.collection<Pick<ScanDocument, 'url'>>('scans')
      // @ts-expect-error - mongo driver types issue with _id being a string
      .findOne({ _id: docId }, { projection: { url: 1 } })

   // 2. Call the OCR service with the URL
   const extractedData = await ocr.extractInvoiceDataFromUrl(url)

   // Here we should pass the extracted data to gpt for approval.
   // Upon approval, gpt will call the finalizeOcrExtraction tool
   // to advance the document to the next step in the pipeline
   // and update the document with the approved data
   // All following code is temporary.

   // 3. Update the document in the database upon successful extraction
   const JobRecord: JobRecord = {
      //  the job is actually active, but we wait for gpt to finalize
      status: JOB_STATUS.WAITING,
      timestamp: new Date(),
      data: extractedData
   }

   await db.collection<ScanDocument>('scans').updateOne(
      { _id: docId },
      { $set: { [OCR_EXTRACTION]: JobRecord } }
   )

   // 4. Set progress to 50% to indicate readiness for user validation
   await job.progress(50)

   // Implement call to gpt for data approval

   // Job will hang untill handled by gpt tool
   return new Promise(() => {})
} 

