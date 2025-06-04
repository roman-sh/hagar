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

   // 🧪 RESTART TEST LOGS - Track when processor is called
   const startTime = new Date().toISOString()
   const processId = process.pid
   
   log.info({
      docId,
      storeId,
      startTime,
      processId,
      jobCreatedAt: new Date(job.timestamp).toISOString()
   }, '🎯 SCAN VALIDATION PROCESSOR CALLED - Restart Test')
   
   console.log(`\n🔥 === RESTART TEST LOG ===`)
   console.log(`🎯 Job ${docId} PROCESSOR CALLED!`)
   console.log(`⏰ Start time: ${startTime}`)
   console.log(`🔧 Process ID: ${processId}`)
   console.log(`📝 Job created: ${new Date(job.timestamp).toISOString()}`)
   console.log(`🧪 IF YOU SEE THIS AFTER RESTART = Bull.js resumes active jobs! ✅`)
   console.log(`=== END RESTART TEST LOG ===\n`)

   // @ts-ignore - MongoDB typing issue with string IDs
   const scanDoc = await db.collection('scans').findOne({ _id: docId }) as ScanDocument

   // Get store document to find manager phone number
   const storeDoc = await db.collection('stores').findOne({
      storeId
   }) as unknown as StoreDocument

   const { manager } = storeDoc

   // Save the PDF information directly to the chat history
   await db.collection('messages').insertOne({
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
      storeId,
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

