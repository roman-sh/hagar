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
import { functions, toolsByQueue, defaultTools } from "../tools/tools"
import { db } from "../connections/mongodb"
import { outboundMessagesQueue } from "../queues-base"
import { json } from "../utils/json"
import systemPrompt from '../prompts/generic.md'
import { ConversationContext } from "../types/shared"
import { messageStore } from "./message-store"
import { findActiveJob } from "./pipeline"
import { QueueKey } from "../queues-base"
import { MAIN_MODEL } from "../config/settings"
import { conversationManager } from './conversation-manager'


const UTILITY_FIELDS = ['_id', 'type', 'storeId', 'createdAt', 'phone', 'contextId']

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
    * Process messages for a phone with GPT
    * note: we have the incoming message/s in history already
    * @param processArgs The user's phone and optional model to use
    */
   async process({
      phone,
      contextId,
      model = MAIN_MODEL
   }: ConversationContext): Promise<void> {
      log.debug({ phone, contextId, model }, 'Triggered GPT processing')

      // We use docId for clarity in some places, but they are the same thing.
      const docId = contextId
 
      // Tools are provided per pipeline stage (queue). 
      const currentTools = [
         ...defaultTools,
         ...(toolsByQueue[await getCurrentQueue(docId)] ?? [])
      ]

      // Get message documents from the database
      const messageDocs = await database.getMessages(phone, contextId)
      const history = composeHistory(messageDocs)

      const state: GptState = {
         done: false,
         messages: []
      }
     
      while (!state.done) {
         // Show typing indicator
         if (await isCurrentContext(contextId, phone)) {
            ;(await messageStore.getChat(phone))?.sendStateTyping()
         }
         // 'message' here is a response from the model
         const { message } = (await openai.chat.completions.create({
            model,
            messages: [
               getSystemMessage(),  // inject the system message dynamically to allow history truncation
               ...history,
               ...state.messages
            ],
            ...(currentTools.length && { tools: currentTools }),
         })).choices[0]

         state.messages.push(message)

         if (message.tool_calls) {
            const toolResults = await executeTools(
               message.tool_calls,
               // we inject the phone and docId as tools's arguments
               phone,
               docId
            )

            state.messages.push(...toolResults)

            // The turn should only end if ALL tool calls returned a isSilent flag.
            // If there's a mix of silent and non-silent tools, the AI needs to continue.
            const isSilent = toolResults.every(result => {
               const content = json.parse(result.content)
               return content.isSilent
            })

            if (isSilent) {
               log.info('Tool(s) requested silent finalization. Ending GPT turn.')
               state.done = true
            }
         }
         else {
            state.done = true
            // Forward the gpt response to the manager
            await conversationManager.send({
               phone,
               contextId,
               content: message.content
            })
         }
      }
      // Save new messages to DB
      await saveMessages(state.messages, phone, contextId)
   }
}


function executeTools(
   toolCalls: ChatCompletionMessageToolCall[],
   phone: string,
   docId: string | undefined
) {
   return Promise.all(toolCalls.map(async call => {
      const fn = functions[call.function.name as keyof typeof functions]
      const args = JSON.parse(call.function.arguments)
      
      log.info({
         tool: call.function.name,
         ...args,
         phone,
         docId,
         callId: call.id
      }, 'TOOL CALL')
      
      try {
         // we inject the phone and docId as tools's arguments
         const result = await fn({ ...args, phone, docId })
         
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
   contextId: string | undefined
): Promise<void> {
   const collection = db.collection('messages')
   const storeId = await database.getStoreIdByPhone(phone)

   for (const message of messages) {
      const messageDoc = {
         ...message,
         content: json.parse(message.content),
         // If present, parse the 'arguments' field when saving to the database to make it look pretty.
         // Otherwise 'tool_calls' will be undefined and ignored when saving to db
         // because of the ignoreUndefined option in the MongoDB client.
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
         contextId,
         createdAt: new Date()
      } as Omit<MessageDocument, '_id'>

      await collection.insertOne(messageDoc)
      await new Promise(resolve => setTimeout(resolve, 1))
   }
}


async function getCurrentQueue(docId: string): Promise<QueueKey | undefined> {
   if (!docId) return
   try {
      const { queueName } = await findActiveJob(docId)
      return queueName
   }
   catch (e) { }  // User has no active job, return undefined
}


async function isCurrentContext(
   contextId: string | undefined,
   phone: string
): Promise<boolean> {
   const currentContext = await conversationManager.getCurrentContext(phone)
   return contextId === currentContext
}
