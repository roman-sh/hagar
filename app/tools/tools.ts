import { ChatCompletionTool } from 'openai/resources'
import { openai } from '../connections/openai.ts'
import { file } from 'bun'

// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   {
      type: 'function',
      function: {
         name: 'onScanValidationPass',
         description:
            'Call this function when a scanned invoice passes validation checks',
         parameters: {
            type: 'object',
            properties: {
               file_id: {
                  type: 'string',
                  description: 'The OpenAI file_id of the validated PDF'
               },
               invoiceNo: {
                  type: 'string',
                  description: 'The invoice number extracted from the document'
               },
               supplier: {
                  type: 'string',
                  description:
                     'The supplier/vendor name extracted from the document'
               },
               date: {
                  type: 'string',
                  description:
                     'The invoice date in ISO format (YYYY-MM-DD) if possible'
               },
               pages: {
                  type: 'integer',
                  description: 'The number of pages in the invoice document'
               },
               annotation: {
                  type: 'string',
                  description:
                     'Detailed explanation of why the scan passed validation'
               }
            },
            required: [
               'file_id',
               'invoiceNo',
               'supplier',
               'date',
               'pages',
               'annotation'
            ]
         }
      }
   },
   {
      type: 'function',
      function: {
         name: 'onScanValidationFail',
         description:
            'Call this function when a scanned invoice fails validation checks',
         parameters: {
            type: 'object',
            properties: {
               file_id: {
                  type: 'string',
                  description: 'The OpenAI file_id of the invalid PDF'
               },
               annotation: {
                  type: 'string',
                  description:
                     'Detailed explanation of issues found in the scan and what needs to be corrected'
               }
            },
            required: ['file_id', 'annotation']
         }
      }
   },
   {
      type: 'function',
      function: {
         name: 'visualInspect',
         description:
            'Analyze the visual content of a PDF for specific information',
         parameters: {
            type: 'object',
            properties: {
               file_id: {
                  type: 'string',
                  description: 'The OpenAI file_id of the PDF to analyze'
               },
               prompt: {
                  type: 'string',
                  description:
                     'Specific instructions for what to look for in the document'
               }
            },
            required: ['file_id', 'prompt']
         }
      }
   }
]

// Tool function implementations
export const functions = {
   /**
    * Tool to call when a scan passes validation
    * @param args - Object containing file_id, invoiceNo, supplier, date, pages and annotation
    * @returns Object with success status and message
    */
   onScanValidationPass: async (args: {
      file_id: string
      invoiceNo: string
      supplier: string
      date: string
      pages: number
      annotation: string
   }) => {
      console.log(`Scan validation passed for file ${args.file_id}`)
      console.log(
         `Invoice: ${args.invoiceNo}, Supplier: ${args.supplier}, Date: ${args.date}, Pages: ${args.pages}`
      )
      console.log(`Annotation: ${args.annotation}`)

      // In a real implementation, this would:
      // 1. Update the document status in the database with extracted metadata
      // 2. Add the document to the next processing queue (OCR analysis)
      // 3. Notify the user of successful validation

      return {
         success: true,
         message:
            'Scan validation passed successfully. Document will be processed.'
      }
   },

   /**
    * Tool to call when a scan fails validation
    * @param args - Object containing file_id and annotation
    * @returns Object with success status and message
    */
   onScanValidationFail: async (args: {
      file_id: string
      annotation: string
   }) => {
      console.log(`Scan validation failed for file ${args.file_id}`)
      console.log(`Annotation: ${args.annotation}`)

      // In a real implementation, this would:
      // 1. Update the document status in the database as "needs attention"
      // 2. Initiate a conversation with the user about the issues
      // 3. Store the annotation to guide the conversation

      return {
         success: true,
         message: 'Scan validation failed. User will be notified of issues.'
      }
   },

   /**
    * TODO: add description here
    */
   visualInspect: async (args: { file_id: string; prompt: string }) => {
      const response = await openai.chat.completions.create({
         model: 'o3',
         messages: [
            {
               role: 'user',
               content: [
                  {
                     type: 'file',
                     file: {
                        file_id: args.file_id
                     }
                  },
                  {
                     type: 'text',
                     text: args.prompt
                  }
               ]
            }
         ]
      })

      return {
         analysis: response.choices[0].message.content
      }
   }
}
