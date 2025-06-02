import { ChatCompletionTool } from 'openai/resources'
import { ScanValidationFailArgs } from '../types/tool-args'

export const onScanValidationFailSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'onScanValidationFail',
      description: 'Call this function when a scanned delivery certificate fails validation checks',
      parameters: {
         type: 'object',
         properties: {
            file_id: {
               type: 'string',
               description: 'The OpenAI file_id of the invalid PDF'
            },
            annotation: {
               type: 'string',
               description: 'Detailed explanation of issues found in the scan and what needs to be corrected'
            }
         },
         required: ['file_id', 'annotation']
      }
   }
}

export const onScanValidationFail = async (args: ScanValidationFailArgs) => {
   // TODO: update the document to reflect the failure

   return {
      success: true,
      message: 'Scan validation failed. User will be notified of issues.'
   }
} 