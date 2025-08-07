import { z } from 'zod'
import { H } from '../config/constants'

// --- Base Schemas ---

const manualCorrectionSchema = z.object({
  [H.ROW_NUMBER]: z.string(),
  [H.MATCH_TYPE]: z.literal('manual'),
  [H.INVENTORY_ITEM_ID]: z.string(),
  [H.QUANTITY]: z.string().optional(),
})

const skipCorrectionSchema = z.object({
  [H.ROW_NUMBER]: z.string(),
  [H.MATCH_TYPE]: z.literal('skip'),
  [H.INVENTORY_ITEM_ID]: z.string().optional().nullable(), // Allow it to be missing or null
  [H.QUANTITY]: z.string().optional(),
})

const rowCorrectionSchema = z.discriminatedUnion(H.MATCH_TYPE, [
  manualCorrectionSchema,
  skipCorrectionSchema,
])

// --- Main Argument Schemas ---

const applyInventoryCorrectionsArgsSchema = z.object({
  docId: z.string(),
  metaCorrection: z.record(z.any()).optional(),
  rowCorrections: z.array(rowCorrectionSchema).optional(),
})


// --- Validation Helper ---

/**
 * Validates the arguments for the applyInventoryCorrections tool.
 * Throws a flattened Zod error object if validation fails.
 *
 * @param args - The raw arguments received by the tool.
 * @returns The validated arguments, cast as `any` to be handled by the calling function's types.
 */
export function validateApplyInventoryCorrectionsArgs(args: unknown): any {
  const result = applyInventoryCorrectionsArgsSchema.safeParse(args)

  if (!result.success) {
    const errorDetails = result.error.flatten()
    log.error({ error: errorDetails }, 'Zod validation failed for applyInventoryCorrections arguments.')
    throw errorDetails
  }

  return result.data
}
