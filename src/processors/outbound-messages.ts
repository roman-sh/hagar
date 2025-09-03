import { Job } from 'bull'
import { OutboundMessageJobData } from '../types/jobs'
import { client } from '../connections/whatsapp'
import whatsappWeb from 'whatsapp-web.js'
const { MessageMedia } = whatsappWeb


/**
 * Process a job for outbound messages using Bull queue.
 * Sends WhatsApp messages to specified phone numbers.
 * 
 * @param job - The Bull job object
 */
export async function outboundMessagesProcessor(job: Job<OutboundMessageJobData>): Promise<void> {
   const chatId = `${job.data.phone}@c.us`

   switch (job.data.type) {
      case 'text':
         await client.sendMessage(chatId, job.data.content)
         log.info(`[OUTBOUND MESSAGE to ${job.data.phone}]:\n${job.data.content}`)
         break
      
      case 'media_url':
         const mediaFromUrl = await MessageMedia.fromUrl(job.data.fileUrl, { filename: job.data.filename })
         await client.sendMessage(chatId, mediaFromUrl)
         log.info(`[OUTBOUND MESSAGE to ${job.data.phone}]: ${job.data.filename}`)
         break

      case 'media_base64':
         const mediaFromBase64 = new MessageMedia(job.data.mimetype, job.data.data, job.data.filename)
         await client.sendMessage(chatId, mediaFromBase64)
         log.info(`[OUTBOUND MESSAGE to ${job.data.phone}]: ${job.data.filename}`)
         break
   }
} 