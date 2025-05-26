import Queue from 'bee-queue'
import { MessageRef } from '../types/jobs'
import { inboundMessagesBeeProcessor } from '../processors/inbound-messages-bee.ts'

/**
 * Dynamic Phone Queue Manager
 * 
 * Why we use separate queues per phone number:
 * 
 * 1. **Message Ordering**: Each phone gets its own queue with concurrency=1, ensuring
 *    messages from the same user are processed in strict chronological order.
 *    This prevents race conditions where a second message might be processed
 *    before the first one completes.
 * 
 * 2. **Parallel Processing**: Different users can send messages simultaneously
 *    without blocking each other. User A's long audio transcription won't
 *    delay User B's simple text message.
 * 
 * 3. **Natural Conversation Flow**: Maintains proper conversation context by
 *    processing messages sequentially per user, which is essential for GPT
 *    to understand the conversation history correctly.
 * 
 * 4. **Scalability**: Queues are created dynamically only when needed.
 *    No pre-allocation required - the system scales automatically as new
 *    users start conversations.
 * 
 * 5. **Clean Architecture**: Eliminates complex locking mechanisms that were
 *    needed with a single shared queue. Each phone's queue is independent
 *    and self-contained.
 * 
 * 6. **In-Memory Queue Registry**: Uses a Map to track active phone queues
 *    in memory rather than passing WhatsApp message objects directly to
 *    queues. This is necessary because queue serialization strips methods
 *    from objects (like message.getContact(), message.downloadMedia()).
 *    The Map enables efficient queue lookup while preserving message
 *    objects in the separate message store. On app restart, the Map is
 *    lost but queues automatically reconnect when new messages arrive.
 */

// Store queues by phone number
const phoneQueues = new Map<string, Queue>()

export const phoneQueueManager = {
   // Get or create queue for a phone
   getQueue(phone: string): Queue {
      if (!phoneQueues.has(phone)) {
         const queue = new Queue(`inbound:${phone}`)

         // Process with concurrency 1 to ensure message ordering per phone
         queue.process(1, async (job) => {
            log.debug({ phone, jobId: job.id }, 'Phone queue processor called')
            return await inboundMessagesBeeProcessor(job)
         })

         phoneQueues.set(phone, queue)
         log.debug({ phone, totalQueues: phoneQueues.size }, 'Phone queue created and stored')
      }
      return phoneQueues.get(phone)!
   },

   // Add message to phone's queue
   async addMessage(phone: string, messageRef: MessageRef) {
      const queue = this.getQueue(phone)
      await queue.createJob(messageRef).save()
   }
}