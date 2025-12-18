import { ChatCompletionTool } from 'openai/resources'
import { validateDeliveryNote, validateDeliveryNoteSchema } from './validate-delivery-note'
import { finalizeScanValidationSchema, finalizeScanValidation } from './finalize-scan-validation'
import { visualInspect, visualInspectSchema } from './visual-inspect'
import { finalizeOcrExtraction, finalizeOcrExtractionSchema } from './finalize-ocr-extraction'
import { getOcrData, getOcrDataSchema } from './get-ocr-data'
import { getInventorySpreadsheet, getInventorySpreadsheetSchema } from './get-inventory-spreadsheet'
import { requestInventoryConfirmation, requestInventoryConfirmationSchema } from './request-inventory-confirmation'
import { productSearch, productSearchSchema } from './product-search'
import { applyInventoryCorrections, applyInventoryCorrectionsSchema } from './apply-inventory-corrections'
import { finalizeUpdatePreparation, finalizeUpdatePreparationSchema } from './finalize-update-preparation'
import { QueueKey } from '../queues-base'
import {
   SCAN_VALIDATION,
   OCR_EXTRACTION,
   UPDATE_PREPARATION,
   INVENTORY_UPDATE,
   EXCEL_EXPORT,
} from '../config/constants'
import { shiftConversationContext, shiftConversationContextSchema } from './shift-conversation-context'
import { finalizeInventoryUpdate, finalizeInventoryUpdateSchema } from './finalize-inventory-update'
import { finalizeExcelExport, finalizeExcelExportSchema } from './finalize-excel-export'


// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   validateDeliveryNoteSchema,
   finalizeScanValidationSchema,
   visualInspectSchema,
   finalizeOcrExtractionSchema,
   getOcrDataSchema,
   getInventorySpreadsheetSchema,
   requestInventoryConfirmationSchema,
   productSearchSchema,
   applyInventoryCorrectionsSchema,
   finalizeUpdatePreparationSchema,
   shiftConversationContextSchema,
   finalizeInventoryUpdateSchema,
   finalizeExcelExportSchema,
]

// Tool function implementations
export const functions = {
   validateDeliveryNote,
   finalizeScanValidation,
   visualInspect,
   finalizeOcrExtraction,
   getOcrData,
   getInventorySpreadsheet,
   requestInventoryConfirmation,
   productSearch,
   applyInventoryCorrections,
   finalizeUpdatePreparation,
   shiftConversationContext,
   finalizeInventoryUpdate,
   finalizeExcelExport,
}

export const toolsByQueue: Record<QueueKey, ChatCompletionTool[]> = {
   [SCAN_VALIDATION]: [
      validateDeliveryNoteSchema,
      finalizeScanValidationSchema,
      visualInspectSchema,
   ],
   [OCR_EXTRACTION]: [
      finalizeOcrExtractionSchema,
      getOcrDataSchema,
   ],
   [UPDATE_PREPARATION]: [
      getInventorySpreadsheetSchema,
      requestInventoryConfirmationSchema,
      productSearchSchema,
      applyInventoryCorrectionsSchema,
      finalizeUpdatePreparationSchema,
   ],
   [INVENTORY_UPDATE]: [
      finalizeInventoryUpdateSchema,
   ],
   [EXCEL_EXPORT]: [
      finalizeExcelExportSchema,
   ],
} satisfies Record<string, ChatCompletionTool[]>


export const defaultTools: ChatCompletionTool[] = [
   shiftConversationContextSchema,
]