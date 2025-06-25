import { db } from '../connections/mongodb'
import { StoreDocument, MessageDocument, ScanDocument, JobRecord, ProductDocument } from '../types/documents'
import { OCR_EXTRACTION } from '../config/constants'
import { redisClient } from '../connections/redis'
import { FindOptions } from 'mongodb'


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


   getStoreIdByPhone: async (phone: string): Promise<StoreDocument['storeId']> => {
      const cacheKey = `storeId:phone:${phone}`
      const cachedStoreId = await redisClient.get(cacheKey)

      if (cachedStoreId) {
         log.debug({ phone }, 'Store ID found in cache')
         return cachedStoreId
      }

      const { storeId } = await db.collection<StoreDocument>('stores')
         .findOne({ phone }, { projection: { storeId: 1 } })

      if (!storeId) {
         // TODO: Set up a demo store for unregistered phones
         throw new Error(`StoreId not found for phone: ${phone}`)
      }

      // Cache the store ID for 24 hours
      await redisClient.set(cacheKey, storeId, 'EX', 60 * 60 * 24)
      log.debug({ phone }, 'Store ID cached in Redis')

      return storeId
   },

   getStore: async (storeId: string): Promise<StoreDocument> => {
      const store = await db.collection<StoreDocument>('stores').findOne({ storeId })
      if (!store) throw new Error(`Store not found for storeId: ${storeId}`)
      return store
   },

   // only update fields we send as data, like this:
   // updateStore(storeId, { catalog: { hash: newHash } })
   updateStore: async (storeId: string, data: Partial<StoreDocument>): Promise<void> => {
      await db.collection('stores').updateOne({ storeId }, { $set: data })
   },

   /**
    * Retrieves all product documents for a specific store.
    * @param {string} storeId - The ID of the store.
    * @param {FindOptions<ProductDocument>} [options={}] - Optional MongoDB find options (e.g., for projection).
    * @returns {Promise<ProductDocument[]>} A promise that resolves to an array of product documents.
    */
   getProductsByStoreId: async (storeId: string, options: FindOptions<ProductDocument> = {}): Promise<ProductDocument[]> => {
      return db.collection<ProductDocument>('products').find({ storeId }, options).toArray()
   },

   /**
    * Performs a batch update to overwrite existing products with new data.
    * For each provided product document, it finds the corresponding document in the DB
    * (by storeId and productId) and updates all fields with the new values.
    * @param {ProductDocument[]} products - An array of product documents to update.
    * @returns {Promise<void>}
    */
   updateProducts: async (products: ProductDocument[]): Promise<void> => {
      const operations = products.map(product => ({
         updateOne: {
            filter: { storeId: product.storeId, productId: product.productId },
            update: { $set: product },
         },
      }))

      await db.collection<ProductDocument>('products').bulkWrite(operations)
   },

   /**
    * Deletes multiple products for a specific store based on their product IDs.
    * @param {string} storeId - The ID of the store from which to delete products.
    * @param {number[]} productIds - An array of product IDs to delete.
    * @returns {Promise<void>}
    */
   deleteProductsByIds: async (storeId: string, productIds: number[]): Promise<void> => {
      await db.collection<ProductDocument>('products').deleteMany({
         storeId,
         productId: { $in: productIds },
      })
   },

   insertProducts: async (products: ProductDocument[]): Promise<void> => {
      await db.collection<ProductDocument>('products').insertMany(products)
   },

   getMessages: async (phone: string, storeId: string): Promise<MessageDocument[]> => {
      // TODO: Add a limit by message count or from_date or maybe do summorization
      // TODO: We may want to create an index to speed up the query
      return await db.collection<MessageDocument>('messages').find({
         'storeId': storeId,
         'phone': phone // Here we can decide if we want only messages from this specific phone, or all messages for store
      })
         .sort({ createdAt: 1 }) // Sort chronologically (oldest first)
         .toArray()
   },


   /**
    * Write job progress to scan document
    * @param jobId - The job ID (document _id)
    * @param queueName - The queue name to use as field name
    * @param jobRecord - The job record to store
    */
   recordJobProgress: async (jobId: string, queueName: string, jobRecord: JobRecord): Promise<void> => {
      // Fetch the specific job field from the document first to get existing data.
      const doc = await db.collection<ScanDocument>('scans').findOne(
         { _id: jobId },
         { projection: { [queueName]: 1 } }
      )

      // Merge existing data with the new record to only update the fields that are provided.
      const existingData = doc?.[queueName as keyof ScanDocument] as JobRecord | undefined
      const mergedRecord = { ...existingData, ...jobRecord }

      await db.collection<ScanDocument>('scans').updateOne(
         { _id: jobId },
         { $set: { [queueName]: mergedRecord } }
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
   },


   /**
    * Retrieves the OCR data from a specific scan document.
    *
    * @param docId - The ID of the scan document.
    * @returns A promise that resolves to the OCR data.
    * @throws An error if the document or the OCR data cannot be found.
    */
   getOcrDataFromScan: async (docId: string) => {
      const data = (
         await db.collection<ScanDocument>('scans').findOne({ _id: docId })
      )?.[OCR_EXTRACTION]?.data

      if (!data) {
         throw new Error(`Could not find existing OCR data for document ${docId}.`)
      }
      return data
   },
}
