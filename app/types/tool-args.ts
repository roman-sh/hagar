/**
 * Shared type definitions for tool function arguments
 */

export interface SendPdfToUserArgs {
   phone: string
   fileId: string
}

export interface completeValidationArgs {
   file_id: string
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