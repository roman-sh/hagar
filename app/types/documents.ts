// Document type definitions for MongoDB collections
import { QueueKey } from '../queues'
import { DocType, SCAN_VALIDATION, OCR_EXTRACTION, DATA_APPROVAL, INVENTORY_UPDATE } from '../config/constants'
import { ChatCompletionMessage, ChatCompletionMessageParam, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import { JobStatus } from 'bull'
import { ObjectId } from 'mongodb'


/**
 * Base job result interface
 */
export interface JobRecord {
   status: JobStatus
   timestamp: Date
   data?: any
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
   author: 'scanner' | string
   channel: 'scanner' | 'whatsapp'
   
   // Optional queue processing results
   [SCAN_VALIDATION]?: JobRecord
   [OCR_EXTRACTION]?: JobRecord
   [DATA_APPROVAL]?: JobRecord
   [INVENTORY_UPDATE]?: JobRecord
}

/**
 * Store document representing a physical store location
 */
export interface StoreDocument extends BaseDocument {
   _id: string
   type: DocType.STORE
   system: string
   deviceId: string
   phone: string
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
   _id: ObjectId
   phone: string
   role: 'system' | 'user' | 'assistant' | 'tool'
   content: any
   tool_calls?: ChatCompletionMessageToolCall[]
   tool_call_id?: string  // for tool messages
   name?: string  // optional participant name
}