import { ChatCompletionTool } from 'openai/resources'
import { InvoiceMeta } from '../types/inventory'
import { pipeline } from '../services/pipeline'


interface finalizeScanValidationArgs extends InvoiceMeta {
  docId: string
  annotation: string
}

export const finalizeScanValidationSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeScanValidation',
      description: 'Call this function when a scanned delivery certificate passes validation checks',
      parameters: {
         type: 'object',
         properties: {
            invoiceId: {
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
         required: ['invoiceId', 'supplier', 'date', 'pages', 'annotation']
      }
   }
}


export const finalizeScanValidation = async (args: finalizeScanValidationArgs) => {
   try {
      const nextStage = await pipeline.advance(args.docId, args)

      return {
         success: true,
         isSilent: !!nextStage,
         nextStage,
      }
   } catch (error) {
      const errorMessage = `Failed to finalize scan validation for docId ${args.docId}.`
      log.error(error, errorMessage)
      return {
         success: false,
         message: `${errorMessage}\nError: ${(error as Error).message}`
      }
   }
} 