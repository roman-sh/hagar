import { db } from '../connections/mongodb.ts'

/**
 * Map a deviceId to a storeId
 * @param deviceId - The deviceId to map
 * @returns The store document
 */
export const resolveStoreForDevice = async (deviceId: string) => {
   // Get a matching storeId for deviceId
   const collections = await db.listCollections().toArray()

   const searchPromises = collections.map((collection) =>
      db.collection(collection.name).findOne({
         type: 'store',
         deviceId
      })
   )

   const results = await Promise.all(searchPromises)
   const storeDoc = results.find((doc) => !!doc)
   if (!storeDoc) {
      throw new Error(`Store not found for device: ${deviceId}`)
   }
   log.info(`Device ${deviceId} mapped to store ${storeDoc.storeId}`)

   return storeDoc
}
