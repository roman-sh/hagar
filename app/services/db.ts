import { DocType } from '../config/constants'
import { db } from '../connections/mongodb'
import { StoreDocument, MessageDocument } from '../types/documents'

export const database = {
   /**
    * Map a deviceId to a storeId
    * @param deviceId - The deviceId to map
    * @returns The store document
    */
   getStoreByDevice: async (deviceId: string): Promise<StoreDocument> => {
      // Get a matching storeId for deviceId
      
      const storeDoc = await db.collection('_stores').findOne({
         deviceId
      }) as StoreDocument | null
      
      if (!storeDoc) {
         throw new Error(`Store not found for device: ${deviceId}`)
      }
      log.info(`Device ${deviceId} mapped to store ${storeDoc.storeId}`)

      return storeDoc
   },

   getStoreByPhone: async (phone: string): Promise<StoreDocument> => {
      const storeDoc = await db.collection('_stores').findOne({
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
      return await db.collection(storeId).find({
         'type': DocType.MESSAGE,
         'phone': phone
      })
      .sort({ createdAt: 1 }) // Sort chronologically (oldest first)
      .toArray() as unknown as MessageDocument[]
   }
}