import { MessageDocument } from "../types/documents"
import { database } from "./db"
import { openai } from "../connections/openai"
import { ChatCompletionMessage, ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionToolMessageParam } from "openai/resources/chat/completions"
import { functions, tools } from "../tools/tools"
import { db } from "../connections/mongodb"
import { DocType } from "../config/constants"
import { outboundMessagesQueue } from "../queues"
import { json } from "../utils/json"
import { readFileSync } from 'node:fs'
import { UserData } from "../types/shared"


const UTILITY_FIELDS = ['_id', 'type', 'storeId', 'createdAt', 'phone']

// ChatCompletionMessageParam is the model query type
// ChatCompletionMessage is the model response type
type Message = 
   ChatCompletionMessage |
   ChatCompletionMessageParam |
   ChatCompletionToolMessageParam

interface GptState {
   done: boolean
   messages: Message[]
}


export const gpt = {
   /**
    * Process messages for a phone/store with GPT
    * note: we have the incoming message/s in history already
    * @param userData The user data containing phone, name, and storeId
    */
   async process({ phone, storeId }: UserData): Promise<void> {
      log.debug({ phone, storeId }, 'Triggered GPT processing')

      // Get message documents from the database
      const messageDocs = await database.getMessages(phone, storeId)
      const history = composeHistory(messageDocs)

      const state: GptState = {
         done: false,
         messages: []
      }

      while (!state.done) {
         // 'message' here is a response from the model
         const { message } = (await openai.chat.completions.create({
            model: 'gpt-4.1-mini-2025-04-14',
            temperature: 0.5,
            // model: 'o3-mini',
            messages: [
               getSystemMessage(storeId, phone),  // inject the system message dynamically to allow history truncation
               ...history,
               ...state.messages
            ],
            tools: tools
         })).choices[0]

         state.messages.push(message)

         if (message.tool_calls) {
            const toolResults = await executeTools(message.tool_calls)
            state.messages.push(...toolResults)
         }
         else {
            state.done = true
            // Forward the gpt response to the manager
            await outboundMessagesQueue.createJob({
               phone,
               content: message.content
            }).save()
         }
      }
      // Save new messages to DB
      await saveMessages(state.messages, phone, storeId)
   }
}


function executeTools(toolCalls: ChatCompletionMessageToolCall[]) {
   return Promise.all(toolCalls.map(async call => {
      const fn = functions[call.function.name as keyof typeof functions]
      const args = JSON.parse(call.function.arguments)
      
      log.info({
         tool: call.function.name,
         arguments: args,
         callId: call.id
      }, 'TOOL CALL')
      
      try {
         const result = await fn(args)
         
         log.info({
            tool: call.function.name,
            response: result,
            callId: call.id
         }, 'TOOL RESPONSE')
         
         return {
            role: 'tool' as const,
            content: JSON.stringify(result),
            tool_call_id: call.id
         }
      }
      catch (e) {
         log.error(e, 'TOOL ERROR')
         return {
            role: 'tool' as const,
            content: JSON.stringify({ error: (e as Error).message }),
            tool_call_id: call.id
         }
      }
   }))
}


function getSystemMessage(storeId: string, phone: string): ChatCompletionMessageParam {
   return {
      role: 'system' as const,
      content: readFileSync(new URL('../prompts/generic.md', import.meta.url), 'utf8')
   }
}


// function composeHistory(messageDocs: MessageDocument[]) {
//    return messageDocs.map(doc => ({
//       ...doc,
//       ...UTILITY_FIELDS.reduce((acc, field) => ({ ...acc, [field]: undefined }), {}),
//       content: json.stringify(doc.content)
//    })) as Message[]
// }


function composeHistory(messageDocs: MessageDocument[]) {
   return messageDocs.map(doc => {
      const message = {} as Message

      for (const key in doc) {
         switch (true) {
            case UTILITY_FIELDS.includes(key):
               break
            case key === 'content':
               message.content = json.stringify(doc.content)
               break
            case key === 'tool_calls':
               (message as ChatCompletionMessage).tool_calls = doc.tool_calls!.map(call => ({
                  ...call,
                  function: {
                     ...call.function,
                     arguments: json.stringify(call.function.arguments)
                  }
               }))
               break
            default:
               message[key as keyof Message] = doc[key as keyof MessageDocument]
         }
      }
      return message
   })
}


async function saveMessages(
   messages: ChatCompletionMessageParam[],
   phone: string,
   storeId: string
): Promise<void> {
   const collection = db.collection('messages')

   for (const message of messages) {
      const messageDoc = {
         ...message,
         content: json.parse(message.content),
         // If present, parse the 'arguments' field when saving to the database to make it look pretty. Otherwise 'tool_calls' will be undefined and ignored when saving to db because of the ignoreUndefined option in the MongoDB client
         tool_calls: (message as ChatCompletionMessage).tool_calls?.map(call => ({
            ...call,
            function: {
               ...call.function,
               arguments: json.parse(call.function.arguments)
            }
         })),
         type: DocType.MESSAGE,
         storeId,
         phone,
         createdAt: new Date()
      } as Omit<MessageDocument, '_id'>

      await collection.insertOne(messageDoc)
      await new Promise(resolve => setTimeout(resolve, 1))
   }
}


