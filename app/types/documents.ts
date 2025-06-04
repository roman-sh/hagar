// Document type definitions for MongoDB collections
import { QueueKey } from '../queues'
import { DocType, SCAN_VALIDATION, DATA_EXTRACTION, DATA_APPROVAL, INVENTORY_UPDATE } from '../config/constants'
import { ChatCompletionMessage, ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import { JobStatus } from 'bull'
import { ObjectId } from 'mongodb'


/**
 * Base job result interface
 */
export interface JobResult {
   status: JobStatus
   [key: string]: any
}

/**
 * Base document interface with common fields for all document types
 */
export interface BaseDocument {
   // _id: string
   type: DocType
   storeId: string
   createdAt: Date
}

/**
 * PDF Scan document for storing uploaded PDF files
 */
export interface ScanDocument extends BaseDocument {
   _id: string
   type: DocType.SCAN,
   fileId: string
   filename: string
   contentType: string
   url: string
   
   // Optional queue processing results
   [SCAN_VALIDATION]?: JobResult
   [DATA_EXTRACTION]?: JobResult
   [DATA_APPROVAL]?: JobResult
   [INVENTORY_UPDATE]?: JobResult
}

/**
 * Store document representing a physical store location
 */
export interface StoreDocument extends BaseDocument {
   _id: string
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

export interface MessageDocument extends BaseDocument {
   _id: string
   phone: string
   role: 'system' | 'user' | 'assistant' | 'tool'
   content: any
   tool_calls?: ChatCompletionMessageToolCall[]
   tool_call_id?: string  // for tool messages
   name?: string  // optional participant name
}