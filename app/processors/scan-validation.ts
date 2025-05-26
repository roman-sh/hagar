import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb.ts'
import { ScanDocument, StoreDocument } from '../types/documents'
import { moveJobToDelayed } from '../services/bull.ts'
import { gpt } from '../services/gpt.ts'
import { DocType } from '../config/constants.ts'


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

   log.info({ docId, storeId }, 'Processing scan validation job')

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
      name: manager.name,
      content: {
         type: 'file',
         source: 'scanner',
         filename: scanDoc.filename,
         file_id: scanDoc.fileId // OpenAI file_id from the document
      },
      createdAt: new Date()
   })

   // Trigger GPT processing directly
   gpt.process({ 
      phone: manager.phone, 
      name: manager.name, 
      storeId 
   })

   log.info({ docId, storeId, filename: scanDoc.filename }, 'PDF sent to GPT for validation')

   // Use Bull's explicit API to move the job to delayed state with a very long delay
   // This should keep it visible in the Bull UI in the "delayed" tab
   await moveJobToDelayed(job, 1e15) // Awaits user interaction

   // TODO: maybe save this promise to redis, and resolve it upon validation pass,
   // instead of moving a job to completed state manually
   return new Promise<BaseJobResult>(() => { })
} 

