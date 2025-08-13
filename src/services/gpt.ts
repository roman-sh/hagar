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
import { UserData } from "../types/shared"
import { messageStore } from "./message-store"
import { findActiveJob } from "./pipeline"
import { QueueKey } from "../queues-base"
import { MAIN_MODEL } from "../config/settings"


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

      /**
       * We allow only one document to be processed at a time. To enforce it, we introduce a 'context guard' concept.
       * While messages history is cleared on new scan upload, stale trigger messages and tool calls/responses
       * from the ongoing scan processing can still pollute the history afterwards.
       */
      const activeDocId = await getCurrentContext(phone)
      const currentTools = [
         ...defaultTools,
         ...(toolsByQueue[await getCurrentQueue(activeDocId)] ?? [])
      ]

      // Get message documents from the database
      const messageDocs = await database.getMessages(phone, storeId)
      
      const history = composeHistory(
         // Filter out stale messages before composing the history
         guardContext(messageDocs, activeDocId)
      )

      const state: GptState = {
         done: false,
         messages: []
      }
     
      while (!state.done) {
         // 'message' here is a response from the model
         const { message } = (await openai.chat.completions.create({
            model: MAIN_MODEL,
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

            // In-flight context check: Abort if context has changed during tool execution.
            // This is a part of the context guard mechanism (see above).
            const currentActiveDocId = await getCurrentContext(phone)
            if (currentActiveDocId !== activeDocId) {
               log.warn({
                  originalDocId: activeDocId,
                  currentDocId: currentActiveDocId
               }, 'Context changed during tool execution. Aborting GPT process.')
               return   // Abort this entire process
            }

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


/**
 * Filters out stale trigger messages and orphan tool responses from the message history.
 * @param messages The array of message documents.
 * @param activeDocId The single, authoritative docId for the current context.
 * @returns A new array of message documents with stale messages removed.
 */
function guardContext(messages: MessageDocument[], activeDocId: string): MessageDocument[] {
   if (!activeDocId) return messages
   
   // Filter the messages based on the context rules.
   return messages.filter(message => {
      // Rule for stale triggers: discard if the docId doesn't match the active context.
      if (message.name === 'app') {
         const triggerDocId = message.content?.docId
         if (triggerDocId && triggerDocId !== activeDocId) {
            log.warn({ activeDocId, triggerDocId }, 'Discarding stale trigger message.')
            return false
         }
      }

      // Otherwise, keep the message.
      return true
   })
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


async function getCurrentQueue(docId: string): Promise<QueueKey | undefined> {
   if (!docId) return
   // Find the queue name from the docId.
   try {
      const { queueName } = await findActiveJob(docId)
      return queueName
   }
   catch (e) { }  // User has no active job, return undefined
}


async function getCurrentContext(phone: string): Promise<string | undefined> {
   const lastScanMessage = await db.collection('messages').findOne(
      { phone, name: 'scanner' },
      { sort: { createdAt: -1 } }    // newest first
   )
   return lastScanMessage?.content?.docId
}
