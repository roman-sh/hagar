/**
 * Message Debouncer
 * 
 * Purpose:
 * This module implements a debouncing mechanism to efficiently batch messages 
 * that arrive in quick succession before triggering GPT processing.
 * 
 * How it works:
 * 1. When a message arrives for a store, we set a Redis key with a short expiration time
 * 2. If another message arrives for the same store during this period, the key's expiration is reset
 * 3. When the quiet period completes (key expires), we process all accumulated messages with GPT
 * 
 * Benefits:
 * - Prevents redundant GPT API calls when multiple messages arrive in bursts
 * - Reduces costs by batching messages into fewer API calls
 * - Improves user experience by processing related messages together
 * - Handles scenarios like WhatsApp reconnections or multi-part file uploads gracefully
 */

import { redisClient, redisSubscriber } from '../connections/redis.js'
import { gpt } from './gpt.js'
import { ConversationContext } from '../types/shared.js'


/**
 * Initialize debouncer that connects inbound messages to GPT processing
 * This sets up a Redis subscription to listen for key expiration events
 * which trigger GPT processing after the quiet period ends
 */
export function initializeDebouncer() {
   // Listen for Redis key expirations
   redisSubscriber.on('message', (channel, key) => {   // 'message' here is the event name
      if (key.startsWith('gpt_trigger:')) {
         const encodedData = key.replace(/^gpt_trigger:/, '')
         const jsonData = decodeURIComponent(encodedData)
         gpt.process(JSON.parse(jsonData))
      }
   })

   log.info('Message debouncer initialized')
}

/**
 * Set a debounced trigger for GPT processing
 * This creates or resets an expiring key in Redis which will trigger
 * GPT processing after the specified delay if no new messages arrive
 * 
 * @param context The user data containing phone and contextId
 * @param delaySeconds How long to wait for more messages (default: 1 second)
 */
export function setGptTrigger(context: ConversationContext, delaySeconds = 1) {
   const data = encodeURIComponent(JSON.stringify(context))
   const key = `gpt_trigger:${data}`
   redisClient.set(key, '1', 'EX', delaySeconds)
}