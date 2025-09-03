import Bull from 'bull'
import { redisClient } from '../connections/redis'
import { outboundMessagesQueue } from '../queues-base'
import { OutboundMessageJobData } from '../types/jobs'
import { OUTBOUND_MESSAGES } from '../config/constants'
import { outboundMessagesProcessor } from '../processors/outbound-messages'


/**
 * @module ConversationManager
 * @description
 * This service provides a robust mechanism for managing concurrent backend processing
 * for a single user's documents. It ensures that while multiple documents can be
 * processed in parallel, the user-facing conversation remains serialized and easy
 * to follow.
 *
 * @architecture
 * The manager orchestrates two key components:
 * 
 * 1. A Redis List (per user): This acts as a strict FIFO (First-In, First-Out)
 *    queue of `contextId`s (which are `docId`s). It represents the ordered sequence
 *    of conversations for that user. The head of the list is the "active" conversation.
 *    - Key Format: `context-queue:<phone>`
 *
 * 2. An In-Memory Map of Bull.js Queues: This holds the actual Bull queue instances
 *    that are responsible for sending outbound messages. There is one queue per
 *    `contextId` and a single global queue for general, non-document-related chat.
 *    - The map is keyed by `contextId` (a string) or `undefined` for the global queue.
 *
 * @flow
 * 1. Initialization (`initializeContext`): When a new document is uploaded, its `docId`
 *    is added to the end of the user's Redis list. A new, dedicated Bull queue is
 *    created for it and stored in the map in a paused state. If this is the
 *    user's first document, its queue is immediately resumed.
 *
 * 2. Message Sending (`send`): Messages are routed to the appropriate queue. If a
 *    `contextId` is provided, the message goes to that document's dedicated queue.
 *    If `contextId` is `undefined`, it goes to the global outbound queue.
 *
 * 3. Context Rotation (`shiftContext`): When a document's processing is complete,
 *    this method is called. It:
 *    a. Pops the completed `contextId` from the head of the Redis list.
 *    b. Closes the associated Bull queue to free up Redis connections.
 *    c. Peeks at the new head of the list.
 *    d. Resumes the queue for the new active context, allowing its buffered
 *       messages to be sent.
 */

// Holds the Bull queue instances, keyed by `docId` (string) or `undefined` for the global queue.
const docQueues = new Map<string | undefined, Bull.Queue<OutboundMessageJobData>>()
// Pre-populate with the global queue for messages without a document context.
docQueues.set(undefined, outboundMessagesQueue)


/**
 * Manages the entire lifecycle of a user's conversational context,
 * including the order of document processing and the state of their
 * associated message queues.
 */
export const conversationManager = {
   /**
    * Initializes the conversation manager.
    * This should be called once on application startup. It clears all stale
    * user context queues from Redis to ensure a clean state.
    */
   async initialize(): Promise<void> {
      const stream = redisClient.scanStream({
         match: 'context-queue:*',
         count: 100,
      })
      let totalKeysDeleted = 0
      for await (const keys of stream) {
         if (keys.length > 0) {
            await redisClient.del(keys)
            totalKeysDeleted += keys.length
         }
      }

      if (totalKeysDeleted > 0) {
         log.info({ count: totalKeysDeleted }, 'Cleared stale user context queues from Redis.')
      }

      log.info('Conversation manager initialized successfully.')
   },

   /**
    * Retrieves the currently active document context ID for a user.
    * If no document is being processed, it returns undefined.
    */
   async getCurrentContext(phone: string): Promise<string | undefined> {
      const key = getContextQueueKey(phone)
      const current = await redisClient.lindex(key, 0)
      return current ?? undefined
   },


   async _getOrCreateQueue(contextId: string | undefined): Promise<Bull.Queue<OutboundMessageJobData>> {
      if (docQueues.has(contextId)) {
         return docQueues.get(contextId)
      }

      const queueName = `${OUTBOUND_MESSAGES}:${contextId}`
      const newDocQueue = new Bull<OutboundMessageJobData>(queueName)

      newDocQueue.process(1, outboundMessagesProcessor)
      await newDocQueue.pause()
      docQueues.set(contextId, newDocQueue)
      log.info({ contextId, queueName }, 'Created new paused outbound document queue.')

      return newDocQueue
   },

   /**
    * Initializes a new document context for a user.
    * It creates the necessary message queue and adds the document to the
    * user's processing queue, activating it if it's the first one.
    */
   async initializeContext(phone: string, docId: string): Promise<void> {
      const currentContext = await this.getCurrentContext(phone)

      const key = getContextQueueKey(phone)
      await redisClient.rpush(key, docId)

      const queue = await this._getOrCreateQueue(docId)

      if (!currentContext) {
         await queue.resume()
         log.info({ docId }, 'First document context activated immediately.')
      }
   },

   /**
    * Sends a message, routing it to the correct queue based on context.
    * This method intelligently constructs the correct job type based on the
    * provided arguments before adding it to the queue.
    */
   async send({ phone, contextId, content, media, fileUrl, filename }: {
      phone: string;
      contextId?: string;
      content?: string | null;
      media?: { mimetype: string; data: string; }; // Corresponds to MediaBase64
      fileUrl?: string;                            // Corresponds to MediaUrl
      filename?: string;
   }) {
      let jobData: OutboundMessageJobData

      const messageType = fileUrl ? 'media_url' : media ? 'media_base64' : content ? 'text' : 'empty'

      switch (messageType) {
         case 'media_url':
            if (!contextId) throw new Error("contextId is required for media messages.")
            jobData = { type: 'media_url', phone, contextId, fileUrl: fileUrl!, filename }
            break
         
         case 'media_base64':
            if (!contextId) throw new Error("contextId is required for media messages.")
            if (!filename) throw new Error("filename is required for base64 media.")
            jobData = { type: 'media_base64', phone, contextId, mimetype: media!.mimetype, data: media!.data, filename }
            break
         
         case 'text':
            jobData = { type: 'text', phone, content: content!, contextId }
            break
         
         case 'empty':
            log.warn({ phone, contextId }, 'Attempted to send an empty message. Aborting.')
            return
      }

      const queue = await this._getOrCreateQueue(jobData.contextId)
      await queue.add(jobData)
   },

   /**
    * Shifts to the next context in the user's queue.
    * This is called after a document's processing is complete. It finds the
    * next document in the Redis list and activates its message queue.
    */
   async shiftContext(phone: string): Promise<void> {
      const key = getContextQueueKey(phone)

      // 1. Remove the current context (if any)
      const contextToDrop = await redisClient.lpop(key) ?? undefined

      // 2. Peek at the new head of the queue (if any)
      const contextToSet = await redisClient.lindex(key, 0) ?? undefined

      /* Clean-up the completed queue */
      if (contextToDrop) {
         await docQueues.get(contextToDrop)?.close()
         docQueues.delete(contextToDrop)
         log.info({ phone, contextToDrop }, 'Context completed & queue closed')
      }

      /* Activate the next queue */
      if (contextToSet) {
         const queue = await this._getOrCreateQueue(contextToSet)
         await queue.resume()
         log.info({ phone, newContext: contextToSet }, 'Switched to new active context')
      }
   },

   /**
    * Retrieves the Bull queue instance for a given context.
    * This is used by tools that need to attach listeners to the queue.
    * @param contextId The document ID (or undefined for the global queue).
    * @returns The Bull queue instance, or undefined if it doesn't exist.
    */
   getQueue(contextId: string | undefined): Bull.Queue<OutboundMessageJobData> | undefined {
      return docQueues.get(contextId)
   },

   /**
    * Schedules a one-time context shift to occur after the next message in a
    * specific document's queue is successfully sent.
    * @param phone The user's phone number.
    * @param docId The document ID whose queue will be monitored.
    * @returns True if the listener was attached, false if the queue was not found.
    */
   scheduleContextShift(phone: string, docId: string): boolean {
      const queue = this.getQueue(docId)
      if (queue) {
         log.info({ phone, docId }, 'Attaching one-time context shift listener to queue.')
         queue.once('completed', () => {
            log.info({ phone, docId }, 'Listener triggered on job completion. Executing scheduled context shift.')
            // Not awaiting this is intentional to avoid blocking message processing.
            this.shiftContext(phone)
         })
         return true
      } else {
         log.error({ phone, docId }, 'Failed to schedule context shift: Queue not found.')
         return false
      }
   },
}


function getContextQueueKey(phone: string): string {
   return `context-queue:${phone}`
}
