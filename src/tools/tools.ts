import { ChatCompletionTool } from 'openai/resources'
import { validateDeliveryNote, validateDeliveryNoteSchema } from './validate-delivery-note'
import { finalizeScanValidationSchema, finalizeScanValidation } from './finalize-scan-validation'
import { visualInspect, visualInspectSchema } from './visual-inspect'
import { sendPdfToUser, sendPdfToUserSchema } from './send-pdf-to-user'
import { finalizeOcrExtraction, finalizeOcrExtractionSchema } from './finalize-ocr-extraction'
import { getOcrData, getOcrDataSchema } from './get-ocr-data'
import { requestInventoryConfirmation, requestInventoryConfirmationSchema } from './request-inventory-confirmation'

// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   validateDeliveryNoteSchema,
   finalizeScanValidationSchema,
   visualInspectSchema,
   sendPdfToUserSchema,
   finalizeOcrExtractionSchema,
   getOcrDataSchema,
   requestInventoryConfirmationSchema,
]

// Tool function implementations
export const functions = {
   validateDeliveryNote,
   finalizeScanValidation,
   visualInspect,
   sendPdfToUser,
   finalizeOcrExtraction,
   getOcrData,
   requestInventoryConfirmation,
}