import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'
import { html } from '../services/html'
import { client } from '../connections/whatsapp'
import whatsappWeb from 'whatsapp-web.js'
import { RequestInventoryConfirmationArgs } from '../types/tool-args'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'

/**
 * The schema for the requestInventoryConfirmation tool, provided to the AI.
 */
export const requestInventoryConfirmationSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'requestInventoryConfirmation',
      description: 'Request user confirmation for an inventory update draft.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: "The id of processed document/invoice."
            },
            caption: {
               type: 'string',
               description: 'The user-facing message to be sent along with the draft file.'
            }
         },
         required: ['docId', 'caption']
      }
   }
}

/**
 * This tool handles the entire user-facing inventory confirmation process.
 * It is designed to be a self-sufficient, all-in-one function called by the agent.
 * @param args - The arguments for the tool, containing the docId.
 */
export const requestInventoryConfirmation = async (args: RequestInventoryConfirmationArgs) => {
   const { docId, caption } = args
   try {
      // Step 1: Find the active job using its ID.
      const { job } = await findActiveJob(docId)

      // Step 2: Extract the inventory document from the job's data.
      const doc = job.data as InventoryDocument

      // Step 3: Retrieve the user's phone number.
      const { phone } = await database.getScanAndStoreDetails(docId)

      // Step 4: Generate the confirmation PDF on-the-fly from the document data.
      const pdfBuffer = await html.generateInventoryConfirmation(doc)

      // Step 5: Create a WhatsApp-compatible media object from the PDF buffer.
      // TODO: we may want to save this to S3 for audit/debugging purposes.
      const media = new whatsappWeb.MessageMedia(
         'application/pdf',
         pdfBuffer.toString('base64'),
         'inventory_update_draft.pdf'
      )

      // Step 6: Send the PDF as a document with the provided caption to the user.
      const chatId = `${phone}@c.us`
      await client.sendMessage(chatId, media, { caption })

      // Return a success message for the tool execution log.
      return {
         success: true,
         message: `Inventory confirmation request sent to ${phone}.`
      }

   } catch (error) {
      // In case of any failure, log the error and return a failure message.
      const errorMessage = `Failed to request inventory confirmation for docId ${docId}.`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`
      }
   }
} 