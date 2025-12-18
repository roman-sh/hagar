import { ChatCompletionTool } from 'openai/resources'
import { pipeline, findActiveJob } from '../services/pipeline'

export const finalizeExcelExportSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeExcelExport',
      description: 'Finalizes the Excel export stage after the file has been successfully generated and sent.',
      parameters: {
         type: 'object',
         properties: {},
         required: [],
      },
   },
}

interface FinalizeExcelExportArgs {
   docId: string
}

/**
 * Finalizes the Excel export stage.
 * This marks the job as completed and advances the pipeline (which likely ends the flow).
 * @param {FinalizeExcelExportArgs} args - The arguments for the function.
 * @returns {Promise<object>} An object confirming the action.
 */
export async function finalizeExcelExport({ docId }: FinalizeExcelExportArgs) {
   try {
      // Advance the job to the next stage (or end the pipeline)
      // The data payload to be stored in the completed job record is empty currently.
      // We may want to store the file in s3 and save the link here for debugging.
      const nextStage = await pipeline.advance(docId, {})

      return {
         success: true,
         isSilent: !!nextStage, // Silent if there's another stage, otherwise let the AI speak (to trigger context shift)
         message: `Excel export for document ${docId} has been finalized.`,
         nextStage,
      }
   }
   catch (error) {
      const errorMessage = `Failed to finalize excel export for docId ${docId}.`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`,
      }
   }
}

