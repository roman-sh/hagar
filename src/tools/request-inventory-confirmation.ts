import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'
import { html } from '../services/html'
import * as inventory from '../services/inventory'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'
import { conversationManager } from '../services/conversation-manager'


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
         properties: {},
         required: []
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

      // Step 4: Retrieve the user's phone number and original filename.
      const { phone, filename: originalFilename } = await database.getScanDetails(docId)

      // Step 5: Generate the confirmation PDF on-the-fly from the document data.
      const pdfBuffer = await html.generateInventoryConfirmation(doc)

      // Step 6: Construct a meaningful filename, preferring supplier/invoice ID but falling back to the original.
      let pdfFilename = originalFilename
      const { supplier, invoiceId } = doc.meta || {}
      if (supplier && invoiceId) {
         // Combine supplier and invoice ID, then sanitize the entire string.
         const rawFilename = `${supplier}_${invoiceId}.pdf`
         pdfFilename = rawFilename.replace(/[\s/\\?%*:|"<>]/g, '_')
      }

      // Step 7: Send the PDF through the queueing system to respect conversation context.
      await conversationManager.send({
         phone,
         contextId: docId,
         media: {
            mimetype: 'application/pdf',
            data: pdfBuffer.toString('base64'),
         },
         filename: pdfFilename
      })

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