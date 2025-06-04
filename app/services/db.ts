import { DocType } from '../config/constants'
import { db } from '../connections/mongodb'
import { StoreDocument, MessageDocument, ScanDocument, JobResult } from '../types/documents'

export const database = {
   /**
    * Map a deviceId to a storeId
    * @param deviceId - The deviceId to map
    * @returns The store document
    */
   getStoreByDevice: async (deviceId: string): Promise<StoreDocument> => {
      // Get a matching storeId for deviceId
      
      const storeDoc = await db.collection('stores').findOne({
         deviceId
      }) as StoreDocument | null
      
      if (!storeDoc) {
         throw new Error(`Store not found for device: ${deviceId}`)
      }
      log.info(`Device ${deviceId} mapped to store ${storeDoc.storeId}`)

      return storeDoc
   },

   getStoreByPhone: async (phone: string): Promise<StoreDocument> => {
      const storeDoc = await db.collection('stores').findOne({
         'manager.phone': phone
      }) as StoreDocument | null
      
      if (!storeDoc) {
         // TODO: Set up a demo store for unregistered phones
         throw new Error(`Store not found for phone: ${phone}`)
      }
      return storeDoc
   },

   getMessages: async (phone: string, storeId: string): Promise<MessageDocument[]> => {
      // TODO: Add a limit by message count or from_date or maybe do summorization
      // TODO: We may want to create an index to speed up the query
      return await db.collection('messages').find({
         'storeId': storeId,
         'phone': phone
      })
      .sort({ createdAt: 1 }) // Sort chronologically (oldest first)
      .toArray() as unknown as MessageDocument[]
   },

   /**
    * Write job status to scan document
    * @param jobId - The job ID (document _id)
    * @param queueName - The queue name to use as field name
    * @param statusData - The status data to store
    */
   trackJobProgress: async (jobId: string, queueName: string, statusData: JobResult): Promise<void> => {
      await db.collection<ScanDocument>('scans').updateOne(
         { _id: jobId } as any,
         { $set: { [queueName]: statusData } }
      )
   }
}