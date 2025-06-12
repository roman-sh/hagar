import { db } from '../connections/mongodb'
import { StoreDocument, MessageDocument, ScanDocument, JobRecord } from '../types/documents'


/**
 * A type representing the combined details from a scan and its store.
 * Derived from the base document types for better maintainability.
 */
type ScanAndStoreDetails
   = Pick<ScanDocument, 'storeId' | 'fileId' | 'filename' | 'url'>
   & Pick<StoreDocument, 'phone'>



export const database = {
   /**
    * Map a deviceId to a storeId
    * @param deviceId - The deviceId to map
    * @returns The store document
    */
   getStoreByDevice: async (deviceId: string): Promise<StoreDocument> => {
      // Get a matching storeId for deviceId
      const storeDoc = await db.collection<StoreDocument>('stores').findOne({ deviceId })
      if (!storeDoc) throw new Error(`Store not found for device: ${deviceId}`)
      log.info(`Device ${deviceId} mapped to store ${storeDoc.storeId}`)
      return storeDoc
   },


   getStoreByPhone: async (phone: string): Promise<StoreDocument> => {
      const storeDoc = await db.collection<StoreDocument>('stores').findOne({ phone })

      if (!storeDoc) {
         // TODO: Set up a demo store for unregistered phones
         throw new Error(`Store not found for phone: ${phone}`)
      }
      return storeDoc
   },


   getMessages: async (phone: string, storeId: string): Promise<MessageDocument[]> => {
      // TODO: Add a limit by message count or from_date or maybe do summorization
      // TODO: We may want to create an index to speed up the query
      return await db.collection<MessageDocument>('messages').find({
         'storeId': storeId,
         'phone': phone
      })
         .sort({ createdAt: 1 }) // Sort chronologically (oldest first)
         .toArray()
   },


   /**
    * Write job status to scan document
    * @param jobId - The job ID (document _id)
    * @param queueName - The queue name to use as field name
    * @param statusData - The status data to store
    */
   recordJobProgress: async (jobId: string, queueName: string, statusData: JobRecord): Promise<void> => {
      await db.collection<ScanDocument>('scans').updateOne(
         { _id: jobId } as any,
         { $set: { [queueName]: statusData } }
      )
   },

   /**
    * Retrieves a store document by looking up a document ID in the scans collection.
    * This function uses an aggregation pipeline to perform a lookup.
    *
    * @param docId - The ID of the document (_id in the scans collection).
    * @returns A promise that resolves to the store document.
    * @throws An error if the store cannot be found.
    */
   getStoreByDocId: async (docId: string): Promise<StoreDocument> => {
      const sequence = [
         // find the scan document by _id
         { $match: { _id: docId } },
         // Joining on the storeId field
         { $lookup: { from: 'stores', localField: 'storeId', foreignField: 'storeId', as: 'store' } },
         // extract the store document from the array of matched results
         { $unwind: '$store' },
         // replace the root(scan document) with the store document
         { $replaceRoot: { newRoot: '$store' } },
      ]

      const results = await db.collection('scans')
         .aggregate<StoreDocument>(sequence).toArray() // convert cursor to array

      if (!results.length) throw new Error(
         `Store not found for document with ID: ${docId}`
      )

      return results[0] // we expect one item in the array
   },


   /**
    * Retrieves a combined set of details from a scan document and its associated store.
    * Uses a single, efficient aggregation query.
    *
    * @param docId - The ID of the document (_id in the scans collection).
    * @returns A promise that resolves to an object with scan and store details.
    * @throws An error if the document or associated store cannot be found.
    */
   getScanAndStoreDetails: async (docId: string): Promise<ScanAndStoreDetails> => {
      const sequence = [
         // 1. Find the specific scan document
         { $match: { _id: docId } },
         // 2. Join with the stores collection
         { $lookup: { from: 'stores', localField: 'storeId', foreignField: 'storeId', as: 'store' } },
         // 3. Deconstruct the store array from the lookup
         { $unwind: '$store' },
         // 4. Project only the fields we need
         {
            $project: {
               _id: 0, // Exclude the ID field
               storeId: '$storeId',
               fileId: '$fileId',
               filename: '$filename',
               url: '$url',
               phone: '$store.phone',
            },
         },
      ]

      // Convert cursor object from 'aggregate' to array and return the first item

      const results = await db.collection('scans')
         .aggregate<ScanAndStoreDetails>(sequence).toArray()

      if (!results.length) throw new Error(
         `Could not find scan or associated store for document ID: ${docId}`
      )

      return results[0]
   }
}
