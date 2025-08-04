/// <reference path="../types/declarations.d.ts" />

import { MessageDocument, DocType } from "../types/documents"
import { database } from "./db"
import { openai } from "../connections/openai"
import {
   type ChatCompletionMessage,
   type ChatCompletionMessageParam,
   type ChatCompletionMessageToolCall,
   type ChatCompletionToolMessageParam
} from "openai/resources/chat/completions"
import { functions, toolsByQueue } from "../tools/tools"
import { db } from "../connections/mongodb"
import { outboundMessagesQueue } from "../queues-base"
import { json } from "../utils/json"
import systemPrompt from '../prompts/generic.md'
import { UserData } from "../types/shared"
import { messageStore } from "./message-store"
import { findActiveJob } from "./pipeline"
import { QueueKey } from "../queues-base"


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
   // TODO: simplify by passing phone only. Use redis caching to get storeId maybe?
   async process({ phone, storeId }: UserData): Promise<void> {
      log.debug({ phone, storeId }, 'Triggered GPT processing')

      // Show typing indicator
      ;(await messageStore.getChat(phone))?.sendStateTyping()

      // Get message documents from the database
      const messageDocs = await database.getMessages(phone, storeId)
      const history = composeHistory(messageDocs)

      const state: GptState = {
         done: false,
         messages: []
      }

      const currentTools = toolsByQueue[await getCurrentQueue(phone)] ?? []

      while (!state.done) {
         // 'message' here is a response from the model
         const { message } = (await openai.chat.completions.create({
            model: 'gpt-4.1',
            messages: [
               getSystemMessage(),  // inject the system message dynamically to allow history truncation
               ...history,
               ...state.messages
            ],
            ...(currentTools.length && { tools: currentTools }),
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
         ...args,
         callId: call.id
      }, 'TOOL CALL')
      
      try {
         const result = await fn(args)
         
         log.info({
            tool: call.function.name,
            response: json.parse(result),
            callId: call.id
         }, 'TOOL RESPONSE')
         
         return {
            role: 'tool' as const,
            content: json.stringify(result),
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


function getSystemMessage(): ChatCompletionMessageParam {
   return {
      role: 'system' as const,
      content: systemPrompt
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


async function getCurrentQueue(phone: string): Promise<QueueKey | undefined> {
   const storeId = await database.getStoreIdByPhone(phone)
   // Find the docId from the last 'scanner' message.
   const lastScanMessage = await db.collection('messages').findOne(
      { storeId, name: 'scanner' },
      { sort: { createdAt: -1 } }    // newest first
    )
   const docId = lastScanMessage?.content?.docId
   if (!docId) return
   // Find the queue name from the docId.
   try {
      const { queueName } = await findActiveJob(docId)
      return queueName
   }
   catch (e) {
      return   // User has no active job, return undefined
   }
}


