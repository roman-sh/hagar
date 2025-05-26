// Document type definitions for MongoDB collections
import { QueueKey } from '../queues.ts'
import { DocType } from '../config/constants.ts'
import { ChatCompletionMessage, ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'

/**
 * Base document interface with common fields for all document types
 */
export interface BaseDocument {
   _id: string
   type: DocType
   storeId: string
   createdAt: Date
}

/**
 * PDF Scan document for storing uploaded PDF files
 */
export interface ScanDocument extends BaseDocument {
   type: DocType.SCAN,
   fileId: string
   filename: string
   contentType: string
   url: string
}

/**
 * Store document representing a physical store location
 */
export interface StoreDocument extends BaseDocument {
   type: DocType.STORE
   system: string
   deviceId: string
   manager: {
      name: string
      phone: string
   }
   pipeline: QueueKey[] // Array of queue steps from QueueKey type
}


/**
 * Message document representing a message in DB
 * _id: string
 * type: DocType
 * storeId: string
 * createdAt: Date
 * phone: string
 * role: 'system' | 'user' | 'assistant' | 'tool'
 * content: any
 * tool_calls?: ChatCompletionMessageToolCall[]
 * tool_call_id?: string  // for tool messages
 * name?: string  // optional participant name
 */
// export type MessageDocument = BaseDocument
//    & (ChatCompletionMessage | ChatCompletionMessageParam)
//    & { phone: string }

export interface MessageDocument {
   _id: string
   type: DocType
   storeId: string
   createdAt: Date
   phone: string
   role: 'system' | 'user' | 'assistant' | 'tool'
   content: any
   tool_calls?: ChatCompletionMessageToolCall[]
   tool_call_id?: string  // for tool messages
   name?: string  // optional participant name
}