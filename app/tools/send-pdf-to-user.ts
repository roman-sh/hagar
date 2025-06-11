import { db } from '../connections/mongodb'
import { client } from '../connections/whatsapp'
import WAWebJS from 'whatsapp-web.js'
import { DocType } from '../config/constants'
import { ScanDocument } from '../types/documents'
import { SendPdfToUserArgs } from '../types/tool-args'
import { ChatCompletionTool } from 'openai/resources'

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

      // Create WhatsApp media from URL
      const media = await WAWebJS.MessageMedia.fromUrl(doc.url, {
         filename: doc.filename
      })

      // Send to WhatsApp
      const chatId = `${args.phone}@c.us`
      await client.sendMessage(chatId, media)

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
            phone: {
               type: 'string',
               description: 'The phone number to send the PDF to (available in system message context)'
            },
            fileId: {
               type: 'string',
               description: 'The OpenAI file_id of the PDF to send'
            }
         },
         required: ['phone', 'fileId']
      }
   }
} 