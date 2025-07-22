import { ChatCompletionTool } from 'openai/resources'
import { validateDeliveryNote, validateDeliveryNoteSchema } from './validate-delivery-note'
import { finalizeScanValidationSchema, finalizeScanValidation } from './finalize-scan-validation'
import { visualInspect, visualInspectSchema } from './visual-inspect'
import { sendPdfToUser, sendPdfToUserSchema } from './send-pdf-to-user'
import { finalizeOcrExtraction, finalizeOcrExtractionSchema } from './finalize-ocr-extraction'
import { getOcrData, getOcrDataSchema } from './get-ocr-data'
import { requestInventoryConfirmation, requestInventoryConfirmationSchema } from './request-inventory-confirmation'
import { productSearch, productSearchSchema } from './product-search'
import { applyRowCorrection, applyRowCorrectionSchema } from './apply-row-correction'

// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   validateDeliveryNoteSchema,
   finalizeScanValidationSchema,
   visualInspectSchema,
   // sendPdfToUserSchema,
   finalizeOcrExtractionSchema,
   getOcrDataSchema,
   requestInventoryConfirmationSchema,
   productSearchSchema,
   applyRowCorrectionSchema,
]

// Tool function implementations
export const functions = {
   validateDeliveryNote,
   finalizeScanValidation,
   visualInspect,
   // sendPdfToUser,
   finalizeOcrExtraction,
   getOcrData,
   requestInventoryConfirmation,
   productSearch,
   applyRowCorrection,
}