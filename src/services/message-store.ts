import { Message, type Chat } from 'whatsapp-web.js'

// In-memory store for WhatsApp message objects
const messagesMap = new Map<string, Message>()

export const messageStore = {
   /**
    * Store a message and return its ID
    * @param message - WhatsApp message object
    * @returns The message ID for queue processing
    */
   store: async (message: Message): Promise<string> => {
      const messageId = message.id._serialized
      const { number } = await message.getContact()
      messagesMap.set(messageId, message)
      messagesMap.set(number, message)  // keep reference to last message for typing indicator
      return messageId
   },
   
   /**
    * Retrieve a message by ID
    * @param messageId - The message ID
    * @returns The original WhatsApp message object
    * @throws Error if message is not found in store
    */
   get: (messageId: string): Message => {
      const message = messagesMap.get(messageId)
      if (!message) {
         log.error({ messageId }, 'Message not found in store')
         throw new Error(`Message ${messageId} not found in store`)
      }
      return message
   },

   /**
    * Retrieve the chat for a given phone number
    * @param phone The phone number
    * @returns The Chat object, or undefined if not found
    */
   getChat: async (phone: string): Promise<Chat | undefined> => {
      const message = messagesMap.get(phone)
      if (message) return await message.getChat()
   },
   
   /**
    * Delete a message from the store
    * @param messageId - The message ID to delete
    */
   delete: (messageId: string): void => {
      const deleted = messagesMap.delete(messageId)
      log.debug({ messageId, deleted, mapSize: messagesMap.size }, 'Message cleanup')
   },
   
   /**
    * Get current map size for monitoring
    */
   getSize: (): number => {
      return messagesMap.size
   },
   
   /**
    * Clean up old messages (TTL cleanup)
    * This could be called periodically to prevent memory leaks
    */
   cleanup: (): void => {
      // For now, just log the size - we could add TTL logic later
      log.info({ mapSize: messagesMap.size }, 'Message store status')
   }
} 