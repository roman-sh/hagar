import { ChatCompletionTool } from 'openai/resources'
import { ScanValidationPassArgs } from '../types/tool-args'

export const onScanValidationPassSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'onScanValidationPass',
      description: 'Call this function when a scanned delivery certificate passes validation checks',
      parameters: {
         type: 'object',
         properties: {
            file_id: {
               type: 'string',
               description: 'The OpenAI file_id of the validated PDF'
            },
            invoiceNo: {
               type: 'string',
               description: 'The certificate/document number extracted from the document'
            },
            supplier: {
               type: 'string',
               description: 'The supplier/vendor name extracted from the document'
            },
            date: {
               type: 'string',
               description: 'The certificate date in ISO format (YYYY-MM-DD) if possible'
            },
            pages: {
               type: 'integer',
               description: 'The number of pages in the delivery certificate document'
            },
            annotation: {
               type: 'string',
               description: 'Detailed explanation of why the scan passed validation'
            }
         },
         required: ['file_id', 'invoiceNo', 'supplier', 'date', 'pages', 'annotation']
      }
   }
}

export const onScanValidationPass = async (args: ScanValidationPassArgs) => {
   // TODO: update the document to reflect the success
   // TODO: add the document to the next processing queue (OCR analysis)

   return {
      success: true,
      message: 'Scan validation passed successfully. Document will be processed.'
   }
} 