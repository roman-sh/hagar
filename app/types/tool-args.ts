import { PageData } from '../services/ocr'

/**
 * Shared type definitions for tool function arguments
 */

export interface SendPdfToUserArgs {
   phone: string
   fileId: string
}

export interface finalizeScanValidationArgs {
   docId: string
   invoiceNo: string
   supplier: string
   date: string
   pages: number
   annotation: string
}

export interface ScanValidationFailArgs {
   file_id: string
   annotation: string
}

export interface VisualInspectArgs {
   file_id: string
   prompt: string
}

export interface FinalizeOcrExtractionArgs {
   docId: string
   data?: any[]
}