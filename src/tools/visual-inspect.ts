import { ChatCompletionTool } from 'openai/resources'
import { openai } from '../connections/openai'
import { AUX_MODEL } from '../config/settings'


interface VisualInspectArgs {
  file_id: string
  prompt: string
}

export const visualInspectSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'visualInspect',
      description: 'Analyzes the visual content of a PDF for specific information. The analysis is limited to the top half portion of each page.',
      parameters: {
         type: 'object',
         properties: {
            file_id: {
               type: 'string',
               description: 'The OpenAI file_id of the PDF to analyze'
            },
            prompt: {
               type: 'string',
               description: 'Specific instructions for what to look for in the document'
            }
         },
         required: ['file_id', 'prompt']
      }
   }
}

export const visualInspect = async (args: VisualInspectArgs) => {
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
                  text: `**IMPORTANT: You are viewing only the top half of each page.** This is intentional. Please answer the user's question based on the content visible in the top portion of the document.\n\nUser's question: "${args.prompt}"`
               }
            ]
         }
      ]
   })
   return response.choices[0].message.content
} 