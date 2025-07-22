import { ChatCompletionTool } from 'openai/resources'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'
import * as inventory from '../services/inventory'
import { GetInventoryMarkdownArgs } from '../types/tool-args'
import { InventoryDraftNotFoundError } from '../errors/application-errors'


export const getInventoryMarkdownSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'getInventoryMarkdown',
      description: 'Retrieves the Markdown representation of an inventory draft pdf, used for providing context to the agent during a correction flow.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.',
            },
         },
         required: ['docId'],
      },
   },
}

/**
 * Retrieves the inventory document as a Markdown string.
 * @param {GetInventoryMarkdownArgs} args - The arguments for the function.
 * @param {string} args.docId - The ID of the document being processed.
 * @returns {Promise<object>} An object containing the Markdown string.
 */
export async function getInventoryMarkdown({ docId }: GetInventoryMarkdownArgs) {
   try {
      const { job } = await findActiveJob(docId)
      const doc = job.data as InventoryDocument

      if (!doc) { throw new InventoryDraftNotFoundError(
         `Could not find an inventory draft in job's data for docId ${docId}.`
      )}

      const markdown = inventory.toMarkdown(doc, docId)

      log.info({ docId }, 'Retrieved inventory draft as Markdown.')

      return {
         success: true,
         markdown,
      }
   } catch (error) {
      let errorMessage: string

      if (error instanceof InventoryDraftNotFoundError) {
         errorMessage = (error as Error).message
      } else {
         errorMessage = `Failed to get inventory draft as Markdown for docId ${docId}.`
      }

      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`,
      }
   }
} 