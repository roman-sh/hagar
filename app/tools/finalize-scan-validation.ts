import { ChatCompletionTool } from 'openai/resources'
import { finalizeScanValidationArgs } from '../types/tool-args'
import { db } from '../connections/mongodb'
import { ScanDocument } from '../types/documents'
import { pipeline } from '../services/pipeline'


export const finalizeScanValidationSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'finalizeScanValidation',
      description: 'Call this function when a scanned delivery certificate passes validation checks',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description: 'The database ID of the document being processed.'
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
         required: ['docId', 'invoiceNo', 'supplier', 'date', 'pages', 'annotation']
      }
   }
}


export const finalizeScanValidation = async (args: finalizeScanValidationArgs) => {
   try {
      await pipeline.advance(args.docId, args)

      return {
         success: true,
         message: 'OK. Document forwarded for further processing.',
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