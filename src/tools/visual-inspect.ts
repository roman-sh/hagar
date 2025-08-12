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
      description: 'Analyze the visual content of a PDF for specific information',
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
                  text: args.prompt
               }
            ]
         }
      ]
   })
   return response.choices[0].message.content
} 