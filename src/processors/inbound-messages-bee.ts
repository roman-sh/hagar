import { db } from '../connections/mongodb'
import { BaseJobResult, MessageRef } from '../types/jobs'
import { setGptTrigger } from '../services/message-debouncer'
import { audio } from '../services/audio'
import { database } from '../services/db'
import { messageStore } from '../services/message-store'
import BeeQueue from 'bee-queue'
import { document } from '../services/document'
import { Message } from 'whatsapp-web.js'


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
   
   // Retrieve the original message object from the store
   const message = messageStore.get(messageId)
   const phone = message.from.split('@')[0] // Extract phone number from WhatsApp ID
   const contact = await message.getContact()
   const userName = (contact.name || contact.pushname || phone).replace(/[\s<|\\/>]/g, '_')
   const storeId = await database.getStoreIdByPhone(phone)
   let content: Message['body'] | undefined
   
   try {
      switch (message.type) {
         case 'document': {
            const media = await message.downloadMedia()
            if (media.mimetype === 'application/pdf') {
               await document.onboard({
                  fileBuffer: Buffer.from(media.data, 'base64'),
                  filename: media.filename,
                  contentType: media.mimetype,
                  storeId,
                  userName,
                  phone
               })
               log.info({ phone, userName, file: media.filename }, 'PDF from WhatsApp onboarded')
               return { success: true, message: 'Document onboarded successfully.' }
            } else {
               throw new Error('Unsupported file type. Please send a PDF document.')
            }
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

         case 'image': {
            // break
         }

         default: {
            throw new Error(`Unsupported message type: ${message.type}`)
         }
      }

      log.info({ name: userName, content }, 'INCOMING MESSAGE')

      await db.collection('messages').insertOne({
         type: 'message',
         role: 'user',
         phone,
         name: userName,
         content,
         storeId,
         createdAt: new Date()
      })

      setGptTrigger(phone)

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