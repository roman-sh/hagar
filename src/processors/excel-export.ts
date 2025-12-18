import { Job } from 'bull'
import { db } from '../connections/mongodb'
import { UPDATE_PREPARATION, H } from '../config/constants'
import { database } from '../services/db'
import { gpt } from '../services/gpt'
import { conversationManager } from '../services/conversation-manager'
import { ScanDocument, MessageDocument, DocType } from '../types/documents'
import { ExcelExportJobData, UpdatePreparationJobCompletedPayload } from '../types/jobs'
import { InventoryDocument, ExportModule } from '../types/inventory'
import { OptionalId } from 'mongodb'

export async function excelExportProcessor(
   job: Job<ExcelExportJobData>
): Promise<void> {
   const docId = job.id as string
   job.log('Starting excel export process.')

   // 1. Get the store and system details from the database.
   const { storeId, system } = await database.getStoreByDocId(docId)

   // 2. Dynamically import the export service for the specific system.
   const exportModule = import.meta.glob('../systems/*/export.ts')
   const exportPath = `../systems/${system}/export.ts`
   
   if (!exportModule[exportPath]) {
       const message = `Export module not found for system: ${system}`
       job.log(message)
       // We might want to fail here or handle it. Failing is appropriate as it's a config error.
       throw new Error(message)
   }

   const { exporter } = await exportModule[exportPath]() as ExportModule

   // 3. Fetch approved items
   const inventoryDoc = await getInventoryDoc(docId)
   
   // 4. Filter valid items
   // We exclude 'skip' items (noise), but we KEEP unmatched items so the user
   // can see them in the file and manually handle them.
   const exportItems = inventoryDoc.items.filter(item => 
      item[H.MATCH_TYPE] !== 'skip'
   )
   
   // 5. Generate Export File using system-specific exporter
   const { data, filename, mimetype } = await exporter.createExportFile(exportItems, docId, inventoryDoc.meta)

   // 6. Send to User via WhatsApp
   const phone = await database.getScanOwnerPhone(docId)
   
   // We use conversationManager to ensure it goes through the correct queue
   await conversationManager.send({
       phone,
       contextId: docId,
       media: {
           mimetype,
           data: Buffer.isBuffer(data) ? data.toString('base64') : data
       },
       filename
   })
   
   job.log(`Sent export file to ${phone}`)

   // 7. Trigger AI Handoff
   await triggerAiHandoff(docId, storeId, phone, {
       event: 'excel_export_succeeded',
   })
   
   // The job hangs here until finalizeExcelExport is called
   return new Promise(() => { })
}

/**
 * Fetches the approved inventory draft from the completed 'update_preparation' stage.
 */
async function getInventoryDoc(docId: string): Promise<InventoryDocument & { storeId?: string }> {
   const scanDoc = await db.collection<ScanDocument>('scans').findOne(
      { _id: docId },
      { projection: { [UPDATE_PREPARATION]: 1, storeId: 1 } }
   )
   const inventoryDoc = (scanDoc?.[UPDATE_PREPARATION] as UpdatePreparationJobCompletedPayload)?.data

   if (!inventoryDoc) {
      const message = `Could not find a completed update_preparation document for docId: ${docId}`
      log.error({ docId }, message)
      throw new Error(message)
   }

   return { ...inventoryDoc, storeId: scanDoc?.storeId }
}

/**
 * Injects a message into the database to trigger an AI handoff.
 */
async function triggerAiHandoff(
   docId: string,
   storeId: string,
   phone: string,
   content: Record<string, any>
) {
   await db.collection<OptionalId<MessageDocument>>('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      phone,
      contextId: docId,
      name: 'app',
      content,
      storeId,
      createdAt: new Date(),
   })

   gpt.process({ phone, contextId: docId })
}
