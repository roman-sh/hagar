import { Job } from 'bull'
import { OutboundMessageJobData } from '../types/jobs'
import { client } from '../connections/whatsapp'
import whatsappWeb from 'whatsapp-web.js'
import { database } from '../services/db'
const { MessageMedia } = whatsappWeb


/**
 * Process a job for outbound messages using Bull queue.
 * Sends WhatsApp messages to specified phone numbers.
 * 
 * @param job - The Bull job object
 */
export async function outboundMessagesProcessor(job: Job<OutboundMessageJobData>): Promise<void> {
   const chatId = `${job.data.phone}@c.us`
   const storeId = await database.getStoreIdByPhone(job.data.phone)

   switch (job.data.type) {
      case 'text':
         await client.sendMessage(chatId, job.data.content)
         log.info(
            { phone: job.data.phone, storeId, content: job.data.content },
            'OUTBOUND MESSAGE')
         break
      
      case 'media_url':
         const mediaFromUrl = await MessageMedia.fromUrl(job.data.fileUrl, { filename: job.data.filename })
         await client.sendMessage(chatId, mediaFromUrl)
         log.info(
            { phone: job.data.phone, storeId, filename: job.data.filename },
            'OUTBOUND MESSAGE')
         break

      case 'media_base64':
         const mediaFromBase64 = new MessageMedia(job.data.mimetype, job.data.data, job.data.filename)
         await client.sendMessage(chatId, mediaFromBase64)
         log.info(
            { phone: job.data.phone, storeId, filename: job.data.filename },
            'OUTBOUND MESSAGE')
         break
   }
} 