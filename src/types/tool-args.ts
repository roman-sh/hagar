/**
 * Shared type definitions for tool function arguments
 */

import { InvoiceMeta } from "./inventory"

export interface SendPdfToUserArgs {
   phone: string
   fileId: string
}

export interface RequestInventoryConfirmationArgs {
   docId: string
}

export interface GetInventoryMarkdownArgs {
   docId: string
}

export interface finalizeScanValidationArgs extends InvoiceMeta {
   docId: string
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

export interface ApplyManualCorrectionsArgs {
   docId: string
   corrections: Record<string, string>
}