// Document type definitions for MongoDB collections
import { QueueKey } from '../queues.ts'
import { DocType } from '../config/constants.ts'

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
export interface StoreDocument {
   _id: string
   type: DocType.STORE
   system: string
   storeId: string
   deviceId: string
   manager: {
      name: string
      phone: string
   }
   pipeline: QueueKey[] // Array of queue steps from QueueKey type
}
