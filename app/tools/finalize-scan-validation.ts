import { ChatCompletionTool } from 'openai/resources'
import { finalizeScanValidationArgs } from '../types/tool-args'
import { db } from '../connections/mongodb'
import { JobResult, ScanDocument } from '../types/documents'
import { queuesMap } from '../queues'
import { SCAN_VALIDATION, JOB_STATUS } from '../config/constants'
import { database } from '../services/db'
import { Job } from 'bull'

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
   // Find the scan document by fileId in the homogeneous scans collection
   const scanDoc = await db.collection<ScanDocument>('scans').findOne({
      fileId: args.file_id
   }, { projection: { _id: 1 } }) as Pick<ScanDocument, '_id'>

   const result: JobResult = {
      status: JOB_STATUS.COMPLETED,
      data: { ...args }
   }

   // Complete the Bull job using the document _id as job ID
   const job = await queuesMap[SCAN_VALIDATION].getJob(scanDoc._id)
   job.progress(100)
   // Bull.js expects string but displays objects better in dashboard than JSON.stringify()
   await job.moveToCompleted(result as any, true)

   // Track job completion in document
   await database.trackJobProgress(scanDoc._id, SCAN_VALIDATION, result)

   return {
      success: true,
      message: 'Scan validation completed. Document will be processed.',
      details: result
   }
} 