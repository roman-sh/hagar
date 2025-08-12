import { openai } from '../connections/openai'
import { ChatCompletionTool } from 'openai/resources'
import { AUX_MODEL } from '../config/settings'


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
      model: AUX_MODEL,
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
                  text: `
Analyze the structure of this document to determine if it is a valid delivery note suitable for a later, high-resolution OCR step.

**Your Task is strictly limited to high-level validation. Do NOT attempt to extract individual line items (products, quantities).**

Focus on these four areas:
1.  **Scan Quality:** Is the document clear and correctly oriented?
2.  **Document Details:** Can you identify a supplier, a date, and a document number?
3.  **Table Structure:** Does a structured table exist?
4.  **Header Validation:** Critically, inspect the table's column headers. Do they contain keywords relevant to inventory updates, such as 'פריט' (item) and 'כמות' (quantity)?
`
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