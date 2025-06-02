import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb'
import { ScanDocument, StoreDocument } from '../types/documents'
import { moveJobToDelayed } from '../services/bull'
import { gpt } from '../services/gpt'
import { DocType } from '../config/constants'


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

   log.info({ "job.id": job.id, storeId }, 'Processing scan validation job')

   // @ts-ignore - MongoDB typing issue with string IDs
   const scanDoc = await db.collection(storeId).findOne({ _id: docId }) as ScanDocument

   // Get store document to find manager phone number
   const storeDoc = await db.collection('_stores').findOne({
      storeId
   }) as unknown as StoreDocument

   const { manager } = storeDoc

   // Save the PDF information directly to the chat history
   await db.collection(storeId).insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone: manager.phone,
      name: 'scanner',
      content: {
         file_id: scanDoc.fileId, // OpenAI file_id from the document
         meta: {
            storeId,
            phone: manager.phone,
            filename: scanDoc.filename,
         },
      },
      createdAt: new Date()
   })

   // Trigger GPT processing directly
   gpt.process({ 
      phone: manager.phone, 
      storeId 
   })

   log.info({ docId, storeId, filename: scanDoc.filename }, 'PDF sent to GPT for validation')

   job.progress(50)

   // Job will hang untill handled by gpt tool
   return new Promise(() => {})
} 

