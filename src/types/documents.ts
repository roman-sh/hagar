// Document type definitions for MongoDB collections
import { QueueKey } from '../queues-base'
import { SCAN_VALIDATION, OCR_EXTRACTION, UPDATE_PREPARATION, INVENTORY_UPDATE } from '../config/constants'
import { ChatCompletionMessage, ChatCompletionMessageToolCall } from 'openai/resources/chat/completions'
import { ObjectId } from 'mongodb'
import {
   JobFailedPayload,
   JobWaitingPayloads,
   JobCompletedPayloads,
} from './jobs'

/**
 * Enum for document types, to be used in discriminator key
 * This is used to differentiate between different document types in the same collection
 */
export enum DocType {
   STORE = 'store',
   SCAN = 'scan',
   MESSAGE = 'message',
   PRODUCT = 'product',
   JOB_ARTEFACT = 'job_artefact',
}

/**
 * Base job result interface
 */
export interface BaseJobRecord {
   timestamp: Date
}

/**
 * Defines the structure of a job record stored in the database.
 * This is a discriminated union based on the `status` field.
 * It uses intersections (`&`) to create a "flattened" structure where
 * the properties of a job's state (e.g., `error` for a failed job)
 * are at the same level as `status` and `timestamp`.
 */
export type JobRecord = BaseJobRecord & (
   | { status: 'active' }
   | ({ status: 'failed' } & JobFailedPayload)
   | ({ status: 'waiting' } & JobWaitingPayloads)
   | ({ status: 'completed' } & JobCompletedPayloads)
)

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
   [UPDATE_PREPARATION]?: JobRecord
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
   backoffice: {
      url: string
      username: string
      password: string
      token?: string
   }
   catalog: {
      lastSync?: Date
      syncCooldownMinutes?: number
   }
}

/**
 * Product document representing a product from a store's catalog
 */
export interface ProductDocument extends BaseDocument {
   _id: string
   type: DocType.PRODUCT
   storeId: string
   productId: number
   name: string
   nameLemmas: string[]
   description: string | null
   unit?: string
   barcodes: string[]
   embedding: number[]
   fingerprint: string
   createdAt: Date
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

/**
 * Job artefact document for storing job-related data blobs.
 * The _id of this document is the same as the originating ScanDocument _id.
 * It uses a mapped type over QueueKey to dynamically create properties
 * for each pipeline stage (e.g., 'scan_validation', 'inventory_update'),
 * allowing each stage to store multiple, keyed data artefacts.
 */
export type JobArtefactDocument = {
   _id: string
   type: DocType.JOB_ARTEFACT
   storeId: string
   createdAt: Date
} & {
   [K in QueueKey]?: Record<string, any>
}

export type AnyDocument = StoreDocument | ScanDocument | ProductDocument | MessageDocument | JobArtefactDocument