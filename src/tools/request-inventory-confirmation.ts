import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'
import { html } from '../services/html'
import * as inventory from '../services/inventory'
import { client } from '../connections/whatsapp'
import whatsappWeb from 'whatsapp-web.js'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'


interface RequestInventoryConfirmationArgs {
  docId: string
}

/**
 * The schema for the requestInventoryConfirmation tool, provided to the AI.
 */
export const requestInventoryConfirmationSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'requestInventoryConfirmation',
      description: 'Sends the user a PDF draft of the inventory update for confirmation.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: "The id of processed document/invoice."
            }
         },
         required: ['docId']
      }
   }
}

/**
 * This tool handles the entire user-facing inventory confirmation process.
 * It is designed to be a self-sufficient, all-in-one function called by the agent.
 * @param args - The arguments for the tool, containing the docId.
 */
export const requestInventoryConfirmation = async (args: RequestInventoryConfirmationArgs) => {
   const { docId } = args
   try {
      // Step 1: Find the active job using its ID.
      const { job } = await findActiveJob(docId)

      // Step 2: Extract the inventory document from the job's data.
      const doc = job.data as InventoryDocument

      // Step 3: Create a summary of the processed document for the agent to use.
      const summary = inventory.createSummary(doc)

      // Step 4: Retrieve the user's phone number.
      const { phone } = await database.getScanAndStoreDetails(docId)

      // Step 5: Generate the confirmation PDF on-the-fly from the document data.
      const pdfBuffer = await html.generateInventoryConfirmation(doc)

      // Step 6: Create a WhatsApp-compatible media object from the PDF buffer.
      // TODO: we may want to save this to S3 for audit/debugging purposes.
      const media = new whatsappWeb.MessageMedia(
         'application/pdf',
         pdfBuffer.toString('base64'),
         'inventory_update_draft.pdf'
      )

      // Step 7: Send the PDF as a document to the user.
      const chatId = `${phone}@c.us`
      await client.sendMessage(chatId, media)

      // Return a success message for the tool execution log.
      return {
         docId,
         success: true,
         message: `Inventory confirmation request sent to ${phone}.`,
         summary,
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