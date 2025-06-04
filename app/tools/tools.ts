import { ChatCompletionTool } from 'openai/resources'
import { validateDeliveryNote, validateDeliveryNoteSchema } from './validate-delivery-note'
import { completeValidationSchema, completeValidation } from './complete-validation'
import { visualInspect, visualInspectSchema } from './visual-inspect'
import { sendPdfToUser, sendPdfToUserSchema } from './send-pdf-to-user'

// Tool schemas for GPT
export const tools: ChatCompletionTool[] = [
   validateDeliveryNoteSchema,
   completeValidationSchema,
   visualInspectSchema,
   sendPdfToUserSchema
]

// Tool function implementations
export const functions = {
   validateDeliveryNote,
   completeValidation,
   visualInspect,
   sendPdfToUser
} 