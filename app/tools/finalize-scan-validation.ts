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


export const finalizeScanValidation = async (args: finalizeScanValidationArgs) => {
   // Find the scan document by fileId in the scans collection
   const { _id: scanDocId } = await db.collection<Pick<ScanDocument, '_id'>>('scans')
      .findOne({ fileId: args.file_id }, { projection: { _id: 1 } })

   await pipeline.advance(scanDocId, args)

   return {
      success: true,
      message: 'Scan validation completed. Document advanced to next step in processing pipeline.',
      details: args
   }
} 