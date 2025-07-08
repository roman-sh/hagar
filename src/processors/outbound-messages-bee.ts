import BeeQueue from 'bee-queue'
import { OutboundMessageJobData, BaseJobResult } from '../types/jobs'
import { client } from '../connections/whatsapp'

/**
 * Process a job for outbound messages using Bee queue.
 * Sends WhatsApp messages to specified phone numbers.
 * 
 * @param job - The Bee job object
 * @returns The processing result
 */
export async function outboundMessagesProcessor(
   job: BeeQueue.Job<OutboundMessageJobData>
): Promise<BaseJobResult> {
   log.info(job.data, 'Processing outbound message job')

   /*
    Process a job for outbound messages.
      Here we need 2 parameters:
      1. Whatsapp phone to send to;
      2. Content to send.
      Or maybe an object like this:
         {
            phone: 972541234567,
            file: <url>
         }
      or:
         {
            phone: 972541234567,
            text: <some text>
         }
   */

   if (job.data.content) {
      await client.sendMessage(job.data.phone + '@c.us', job.data.content)
   }

   return {
      success: true,
      message: `Message sent to ${job.data.phone}`
   }
} 