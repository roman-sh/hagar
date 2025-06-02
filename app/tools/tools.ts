import { ChatCompletionTool } from 'openai/resources'
import { validateDeliveryNote, validateDeliveryNoteSchema } from './validate-delivery-note'
import { onScanValidationPass, onScanValidationPassSchema } from './on-scan-validation-pass'
import { onScanValidationFail, onScanValidationFailSchema } from './on-scan-validation-fail'
import { visualInspect, visualInspectSchema } from './visual-inspect'
import { sendPdfToUser, sendPdfToUserSchema } from './send-pdf-to-user'

// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   validateDeliveryNoteSchema,
   onScanValidationPassSchema,
   onScanValidationFailSchema,
   visualInspectSchema,
   sendPdfToUserSchema
]

// Tool function implementations
export const functions = {
   validateDeliveryNote,
   onScanValidationPass,
   onScanValidationFail,
   visualInspect,
   sendPdfToUser
} 