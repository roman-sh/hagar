import { type InvoiceMeta } from '../types/inventory'

/**
 * Extracts the numeric/suffix ID from a composite inventory item ID.
 * Expected format: "product:<storeId>:<productId>"
 * Returns the last segment.
 */
export function extractInventoryId(compositeId: string): string {
   // Matches "product:" prefix, then the storeId (non-greedy, no colons), 
   // then captures the final ID segment (which may contain colons).
   const regex = /^product:[^:]+:(.+)$/
   const match = compositeId.match(regex)

   if (!match || !match[1]) {
      throw new Error(`extractInventoryId: Invalid format or failed to extract ID from "${compositeId}"`)
   }

   return match[1]
}

/**
 * Generates a standardized, sanitized filename for export documents.
 * Prioritizes "{supplier}_{invoiceId}" if available, otherwise falls back to fallback.
 */
export function generateExportFilename(options: {
   extension: string
   docId: string
   meta: InvoiceMeta
}): string {
   const { extension, docId, meta } = options
   // Extracts filename from docId (e.g. "scan:store:file.pdf" -> "file"), or uses docId as is
   const fallback = docId.replace(/^.*:|(\.[^.]+)$/g, '')
   let filename = `${fallback}.${extension}`
   const { supplier, invoiceId } = meta

   if (supplier && invoiceId) {
      // Combine supplier and invoice ID, then sanitize the entire string.
      const rawFilename = `${supplier}_${invoiceId}.${extension}`
      filename = rawFilename.replace(/[\s/\\?%*:|"<>]/g, '_')
   }

   return filename
}
