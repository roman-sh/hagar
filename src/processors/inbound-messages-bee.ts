import { db } from '../connections/mongodb'
import { BaseJobResult, MessageRef } from '../types/jobs'
import { audio } from '../services/audio'
import { database } from '../services/db'
import { messageStore } from '../services/message-store'
import BeeQueue from 'bee-queue'
import { document } from '../services/document'
import { Message } from 'whatsapp-web.js'
import { conversationManager } from '../services/conversation-manager'
import { pipeline } from '../services/pipeline'
import { MessageDocument, DocType } from '../types/documents'
import { OptionalId } from 'mongodb'
import { setGptTrigger } from '../services/message-debouncer'


/**
 * Process an inbound message job using Bee queues
 * @param job - The Bee job object containing message ID
 * @returns The processing result
 */
export async function inboundMessagesBeeProcessor(
   job: BeeQueue.Job<MessageRef>
): Promise<BaseJobResult> {
   const
      messageId = job.data.messageId,
      jobId = job.id
   
   log.debug({ jobId, messageId }, 'Starting inbound message processing')
   
   const
      // Retrieve the original message object from the store
      message = messageStore.get(messageId),
      contact = await message.getContact(),
      { number: phone } = contact,
      userName = (contact.name || contact.pushname || phone).replace(/[\s<|\\/>]/g, '_'),
      storeId = await database.getStoreIdByPhone(phone)

   let content: Message['body'] | undefined
   
   try {
      switch (message.type) {
         case 'document': {
            const media = await message.downloadMedia()
            if (media.mimetype !== 'application/pdf') {
               throw new Error('Unsupported file type. Please send a PDF document.')
            }

            // 1. Onboard document (uploads, creates DB record)
            const { docId } = await document.onboard({
               fileBuffer: Buffer.from(media.data, 'base64'),
               filename: media.filename,
               contentType: media.mimetype,
               storeId,
               userName,
               phone
            })
            log.info({ phone, userName, docId }, 'PDF from WhatsApp onboarded')

            // 2. Initialize the new document context. The manager will handle
            // creating the queue and activating it if it's the user's first document.
            await conversationManager.initializeContext(phone, docId)

            // 3. Start the processing pipeline
            await pipeline.start(docId)
            
            return { success: true, message: 'Document onboarded successfully.' }
         }

         
         case 'chat': {
            content = message.body
            break
         }

         
         case 'audio':
         case 'ptt': {
            const media = await message.downloadMedia()
            content = await audio.transcribe(media)
            break
         }
         

         case 'e2e_notification':
         case 'notification_template': {
            log.info({ type: message.type }, 'Ignoring system message type.')
            return { success: true, message: 'System message ignored.' }
         }
 

         case 'image': {
            // break
         }
 
         
         default: {
            throw new Error(`Unsupported message type: ${message.type}`)
         }
      }

      log.info({ name: userName, content }, 'INCOMING MESSAGE')

      const contextId = await conversationManager.getCurrentContext(phone)

      await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
         type: DocType.MESSAGE,
         role: 'user',
         phone,
         name: userName,
         content,
         storeId,
         contextId,  // We assign incoming message to current conversation context.
         createdAt: new Date()
      })

      // Trigger GPT with debouncing, passing the determined context.
      setGptTrigger({ phone, contextId })

      return {
         success: true,
         message: 'Message processed'
      }
   }
   catch (error: any) {
      log.error({ err: error, notifyPhone: phone, storeId }, `Failed to process inbound message`)
      throw error // Re-throw to fail the job in the queue
   }
   finally {
      // Clean up message from store
      messageStore.delete(job.data.messageId)
   }
} 