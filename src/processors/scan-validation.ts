import { Job } from 'bull'
import { ScanValidationJobData } from '../types/jobs.js'
import { db } from '../connections/mongodb'
import { OptionalId } from 'mongodb'
import { MessageDocument, DocType } from '../types/documents'
import { gpt } from '../services/gpt.js'
import { database } from '../services/db.js'


/**
 * Process a job for scan validation
 * @param job The Bull job object containing job data.
 * @returns A promise that never resolves, to keep the job in an active state.
 */
export async function scanValidationProcessor(
   job: Job<ScanValidationJobData>
): Promise<void> {
   const docId = job.id as string

   const { storeId, fileId, filename, phone } = await database.getScanAndStoreDetails(docId)

   // Save the PDF information directly to the chat history
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      contextId: docId,
      name: 'scanner',
      content: {
         action: 'validate_delivery_note',
         file_id: fileId, // OpenAI file_id from the document
         docId,
         filename
      },
      storeId,
      createdAt: new Date()
   })

   // Trigger GPT processing directly
   gpt.process({ phone, contextId: docId })

   const logMessage = `Agent triggered with action: validate_delivery_note`
   job.log(logMessage)

   log.info({ docId, storeId, filename }, logMessage)

   job.progress(50)

   // Job will hang untill handled by gpt tool
   return new Promise(() => {})
} 

