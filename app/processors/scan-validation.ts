import { Job } from 'bull'
import { JobData, BaseJobResult } from '../types/jobs'
import { db } from '../connections/mongodb'
import { OptionalId } from 'mongodb'
import { MessageDocument, ScanDocument, StoreDocument } from '../types/documents'
import { gpt } from '../services/gpt'
import { DocType } from '../config/constants'
import { database } from '../services/db'


/**
 * Process a job for scan validation
 * @param job - The Bull job object
 * @returns The processing result
 */
export async function scanValidationProcessor(
   job: Job<JobData>
): Promise<BaseJobResult> {
   const docId = job.id as string

   const { storeId, fileId, filename, phone } = await database.getScanAndStoreDetails(docId)

   // Save the PDF information directly to the chat history
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      name: 'scanner',
      content: {
         file_id: fileId, // OpenAI file_id from the document
         docId,
         phone,   // TODO: redundant?
         filename
      },
      storeId,
      createdAt: new Date()
   })

   // Trigger GPT processing directly
   gpt.process({ 
      phone, 
      storeId 
   })

   log.info({ docId, storeId, filename }, 'Document sent to GPT for validation')

   job.progress(50)

   // Job will hang untill handled by gpt tool
   return new Promise(() => {})
} 

