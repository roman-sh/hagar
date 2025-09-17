import { ChatCompletionTool } from 'openai/resources/chat/completions'
import { pipeline, findActiveJob } from '../services/pipeline'


export const finalizeInventoryUpdateSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeInventoryUpdate',
      description: 'Finalizes the inventory update process. This is the final step in the pipeline.',
      parameters: {
         type: 'object',
         properties: {},
         required: [],
      },
   },
}


export async function finalizeInventoryUpdate({ docId }: { docId: string }) {
   try {
      // First, get the summary that the processor saved on the job.
      const { job } = await findActiveJob(docId)
      const { summary } = job.data

      // Now, advance the pipeline to complete the job.
      await pipeline.advance(docId, {})
      log.info({ docId }, 'Successfully finalized inventory update and advanced pipeline.')

      // Finally, return the summary to the AI to be presented to the user.
      return {
         success: true,
         summary,
         message: 'Inventory update process has been successfully finalized with a summary.',
      }
   } catch (error) {
      const errorMessage = `Failed to finalize inventory update for docId: ${docId}`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}. Error: ${(error as Error).message}`,
      }
   }
}
