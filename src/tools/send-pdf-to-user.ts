import { db } from '../connections/mongodb'
import { ScanDocument } from '../types/documents'
import { ChatCompletionTool } from 'openai/resources'
import { conversationManager } from '../services/conversation-manager'


interface SendPdfToUserArgs {
  phone: string
  docId: string
  fileId: string
}

/**
 * Send a PDF document to a user via WhatsApp
 * @param args - Object containing phone and fileId
 * @returns Object with success status and message
 */
export async function sendPdfToUser(args: SendPdfToUserArgs) {
   try {
      // Search for the document by fileId in the homogeneous scans collection
      const doc = await db.collection<ScanDocument>('scans').findOne({
         fileId: args.fileId
      })

      // Send the PDF through the queueing system
      await conversationManager.send({
         phone: args.phone,
         contextId: args.docId,
         fileUrl: doc.url,
         filename: doc.filename
      })

      return {
         success: true,
         message: `File ${doc.filename} was sent`
      }

   } catch (error) {
      log.error(error, 'Failed to send PDF', { fileId: args.fileId })
      return {
         success: false,
         message: 'Failed to send PDF'
      }
   }
}

export const sendPdfToUserSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'sendPdfToUser',
      description: 'Send a PDF document to a user',
      parameters: {
         type: 'object',
         properties: {
            fileId: {
               type: 'string',
               description: 'The OpenAI file_id of the PDF to send'
            }
         },
         required: ['fileId']
      }
   }
} 