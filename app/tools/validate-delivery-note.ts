import { openai } from '../connections/openai'
import { ChatCompletionTool } from 'openai/resources'

export const validateDeliveryNoteSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'validateDeliveryNote',
      description: 'Extract structured details from a delivery note PDF for validation',
      parameters: {
         type: 'object',
         properties: {
            file_id: {
               type: 'string',
               description: 'The OpenAI file_id of the PDF to analyze'
            }
         },
         required: ['file_id']
      }
   }
}


export const validateDeliveryNote = async (args: { file_id: string }) => {
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
                  text: 'Extract specific details from this document for inventory management purposes. Provide exact values, not descriptions. If a field cannot be determined, use "לא זוהה" (not identified). Focus on whether the document contains the necessary information for inventory updates (products, quantities, supplier, date) regardless of document type (invoice, delivery note, receipt, etc.).'
               }
            ]
         }
      ],
      response_format: {
         type: "json_schema",
         json_schema: {
            name: "document_analysis",
            strict: true,
            schema: {
               type: "object",
               properties: {
                  scan_quality: {
                     type: "object",
                     properties: {
                        is_clear: { type: "boolean" },
                        orientation_correct: { type: "boolean" },
                        issues: { type: "string" }
                     },
                     required: ["is_clear", "orientation_correct", "issues"],
                     additionalProperties: false
                  },
                  document_details: {
                     type: "object",
                     properties: {
                        document_number: { type: "string" },
                        supplier_name: { type: "string" },
                        date: { type: "string" },
                        pages_count: { type: "integer" }
                     },
                     required: ["document_number", "supplier_name", "date", "pages_count"],
                     additionalProperties: false
                  },
                  table_structure: {
                     type: "object",
                     properties: {
                        has_structured_table: { type: "boolean" },
                        has_relevant_headers: { type: "boolean" },
                        description: { type: "string" }
                     },
                     required: ["has_structured_table", "has_relevant_headers", "description"],
                     additionalProperties: false
                  },
                  overall_assessment: {
                     type: "object",
                     properties: {
                        has_required_inventory_data: { type: "boolean" },
                        summary: { type: "string" }
                     },
                     required: ["has_required_inventory_data", "summary"],
                     additionalProperties: false
                  }
               },
               required: ["scan_quality", "document_details", "table_structure", "overall_assessment"],
               additionalProperties: false
            }
         }
      }
   })

   return response.choices[0].message.content
}