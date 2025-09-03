import { z } from 'zod'
import { ChatCompletionTool } from 'openai/resources'
import { conversationManager } from '../services/conversation-manager'

export const shiftConversationContextSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'shiftConversationContext',
      description: 'Interrupts the current document processing flow and moves to the next document if available.',
      parameters: {
         type: 'object',
         properties: {},
         required: [],
      },
   },
}

const inputSchema = z.object({
   phone: z.string(),
   docId: z.string(),
})

export async function shiftConversationContext(input: unknown) {
   const { phone, docId } = inputSchema.parse(input)

   const success = conversationManager.scheduleContextShift(phone, docId)

   if (success) {
      return {
         success: true,
         message: 'Context shift has been scheduled. Provide a final, concluding message to the user about the document you just finished.'
      }
   } else {
      return {
         success: false,
         message: 'Error: Could not schedule the context shift. The message queue for the current document was not found.'
      }
   }
}
