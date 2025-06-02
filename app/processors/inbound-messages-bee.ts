import { db } from '../connections/mongodb'
import { BaseJobResult, MessageRef } from '../types/jobs'
import { setGptTrigger } from '../services/message-debouncer'
import { audio } from '../services/audio'
import { database } from '../services/db'
import { messageStore } from '../services/message-store'
import BeeQueue from 'bee-queue'

/**
 * Process an inbound message job using Bee queues
 * @param job - The Bee job object containing message ID
 * @returns The processing result
 */
export async function inboundMessagesBeeProcessor(
   job: BeeQueue.Job<MessageRef>
): Promise<BaseJobResult> {
   log.info({ jobId: job.id, messageId: job.data.messageId }, 'Starting inbound message processing')

   try {
      // Retrieve the original message object from the store
      const message = messageStore.get(job.data.messageId)

      const phone = message.from.split('@')[0] // Extract phone number from WhatsApp ID

      // Process the message content
      let content

      switch (message.type) {
         case 'chat':
            content = message.body
            break

         case 'audio':
         case 'ptt':
            const media = await message.downloadMedia()
            content = await audio.transcribe(media)
            break

         case 'image':
            break

         // TODO: add support for pdf files

         default:
            log.error('Unhandled message type:', message.type)
      }

      // Get contact name using the original message object
      const contact = await message.getContact()
      const name = (contact.name || contact.pushname || phone).replace(/[\s<|\\/>]/g, '_')
      
      log.info({ 
         phone, 
         name, 
         messageType: message.type,
         content: content 
      }, 'INCOMING MESSAGE')

      const { storeId } = await database.getStoreByPhone(phone)

      // Save to chat history before passing to LLM
      await db.collection(storeId).insertOne({
         type: 'message',
         role: 'user',
         phone,
         name,
         content,
         createdAt: new Date()
      })

      // Set debounce key with 1-second expiration
      // If multiple messages arrive, this keeps extending the timeout
      setGptTrigger({ phone, storeId })

      return {
         success: true,
         docId: job.id,
         message: 'Message processed'
      }

   } finally {
      // Clean up message from store
      messageStore.delete(job.data.messageId)
   }
} 