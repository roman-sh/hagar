import { db } from '../connections/mongodb'
import {
   StoreDocument,
   MessageDocument,
   ScanDocument,
   JobRecord,
   ProductDocument,
   JobArtefactDocument,
   UpdateDocument,
} from '../types/documents'
import { OCR_EXTRACTION, SCAN_VALIDATION, META_KEYS } from '../config/constants'
import { redisClient } from '../connections/redis'
import { FindOptions, ObjectId } from 'mongodb'
import {
   JobFailedPayload,
   JobWaitingPayloads,
   JobCompletedPayloads,
   ScanValidationJobCompletedPayload,
   OcrExtractionJobCompletedPayload,
} from '../types/jobs'
import { InvoiceMeta, ProductCandidate, InventoryItem } from '../types/inventory'
import { QueueKey } from '../queues-base'
import { TEXT_SEARCH_INDEX_NAME, LEMMA_SEARCH_CANDIDATE_LIMIT } from '../config/settings'
import { DocType } from '../types/documents'
import { createCanonicalNameKey } from '../utils/string-utils'


/**
 * A type representing the combined details from a scan and its store.
 * Derived from the base document types for better maintainability.
 */
type ScanAndStoreDetails
   = Pick<ScanDocument, 'storeId' | 'fileId' | 'filename' | 'url' | 'phone'>

interface RecordJobProgressArgsBase {
   jobId: string
   queueName: string
}

type RecordJobProgressArgs = RecordJobProgressArgsBase & (
   | { status: 'active' }
   | ({ status: 'failed' } & JobFailedPayload)
   | ({ status: 'waiting' } & JobWaitingPayloads)
   | ({ status: 'completed' } & JobCompletedPayloads)
)

interface SaveArtefactArgs {
   docId: string
   queue: QueueKey
   key: string
   data: any
   flatten?: boolean
}


export const database = {
   /**
    * Saves a data blob (artefact) related to a specific job stage.
    * This function performs an upsert operation on the `job_artefacts` collection.
    * If a document with the given `docId` doesn't exist, it creates one,
    * setting the `_id`, `storeId`, and `createdAt` fields.
    * It then uses dot notation to set the artefact data in a nested object
    * corresponding to the job stage, ensuring that multiple artefacts for the
    * same job can be stored without overwriting each other.
    *
    * @param {SaveArtefactArgs} args - The arguments for saving the artefact.
    */
   saveArtefact: async (
      { docId, queue, key, data, flatten = false }: SaveArtefactArgs
   ): Promise<void> => {
      const collection = db.collection<JobArtefactDocument>('job_artefacts')
      key = key.replace(/-/g, '_')
      
      const scanDoc = await db.collection<ScanDocument>('scans').findOne(
         { _id: docId },
         { projection: { storeId: 1 } }
      )
      if (!scanDoc || !scanDoc.storeId) {
         throw new Error(`Could not find storeId for docId: ${docId}`)
      }
      const { storeId } = scanDoc

      const payload = flatten
         ? { timestamp: new Date(), ...data }
         : { timestamp: new Date(), data }

      const filter = { _id: docId }
      const update = {
         $set: { [`${queue}.${key}`]: payload },
         $setOnInsert: {
            _id: docId,
            storeId,
            createdAt: new Date(),
         }
      }

      await collection.updateOne(filter, update, { upsert: true })
   },


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


   /**
    * Retrieves the storeId associated with a given phone number.
    * It first checks a Redis cache for the mapping. If not found, it queries
    * the MongoDB `stores` collection, searching for a match in the `phones` array.
    * The result is then cached in Redis for 24 hours.
    * It includes error handling to notify via AI and throw if no store or multiple stores are found.
    *
    * @param {string} phone - The phone number to look up.
    * @returns {Promise<string>} A promise that resolves to the storeId.
    * @throws {Error} Throws an error if no store is found for the phone number.
    * @throws {Error} Throws an error if multiple stores are found for the same phone number.
    */
   getStoreIdByPhone: async (phone: string): Promise<StoreDocument['storeId']> => {
      const cacheKey = `storeId:phone:${phone}`
      const cachedStoreId = await redisClient.get(cacheKey)

      if (cachedStoreId) {
         log.debug({ phone }, 'Store ID found in cache')
         return cachedStoreId
      }

      const matchingStores = await db.collection<StoreDocument>('stores')
         .find({ phones: phone }, { projection: { storeId: 1 } }).toArray()

      if (!matchingStores.length) {
         const message = `StoreId not found for phone: ${phone}`
         log.error({ notifyPhone: phone }, message)
         // TODO: Set up a demo store for unregistered phones
         throw new Error(message)
      }

      if (matchingStores.length > 1) {
         const message = `Multiple stores found for phone: ${phone}.`
         log.error({ notifyPhone: phone, storesFound: matchingStores }, message)
         throw new Error(message)
      }

      const { storeId } = matchingStores[0]

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

   getStoreByName: async (storeName: string): Promise<StoreDocument | null> => {
      const nameKey = createCanonicalNameKey(storeName)
      const store = await db.collection<StoreDocument>('stores').findOne({ nameKey })
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
    * Retrieves the essential details for multiple products using a single, efficient query.
    * @param {string[]} productIds - An array of product _ids to fetch.
    * @returns {Promise<Pick<ProductDocument, '_id' | 'name' | 'unit'>[]>} A promise that resolves to an array of product details.
    */
   async getInventoryProductDetails(
      productIds: string[]
   ): Promise<Pick<ProductDocument, '_id' | 'name' | 'unit'>[]> {
      const products = await db.collection<ProductDocument>('products').find(
         { _id: { $in: productIds } },
         { projection: { _id: 1, name: 1, unit: 1 } }
      ).toArray()
      
      return products as Pick<ProductDocument, '_id' | 'name' | 'unit'>[]
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


   /**
    * Retrieves messages for a specific phone number, optionally filtered by a context ID.
    * If a `contextId` is provided, it fetches messages belonging to that specific
    * document processing context. If `contextId` is `undefined`, it fetches only
    * "general" conversation messages that do not have a `contextId`.
    *
    * @param {string} phone - The user's phone number.
    * @param {string | undefined} contextId - The optional context (document) ID.
    * @returns {Promise<MessageDocument[]>} A promise that resolves to an array of message documents.
    */
   getMessages: async (
      phone: string,
      contextId: string | undefined
   ): Promise<MessageDocument[]> => {
      const query: any = { phone }
      query.contextId = contextId ?? { $exists: false }
      return db.collection<MessageDocument>('messages').find(query)
         .sort({ createdAt: 1 }) // Sort chronologically (oldest first)
         .toArray()
   },


   /**
    * Retrieves the phone number of the user who initiated a scan.
    * Uses a simple, efficient findOne query on the scans collection.
    * @param {string} docId - The ID of the scan document.
    * @returns {Promise<string>} A promise that resolves to the phone number.
    * @throws {Error} Throws an error if the document is not found or has no phone number.
    */
   getScanOwnerPhone: async (docId: string): Promise<string> => {
      const scan = await db.collection<ScanDocument>('scans').findOne(
         { _id: docId },
         { projection: { phone: 1 } }
      )

      if (!scan || !scan.phone) {
         const message = `Could not find phone number for docId: ${docId}`
         log.error(message)
         throw new Error(message)
      }

      return scan.phone
   },


   /**
    * Retrieves key details from a scan document using a simple find query.
    * @param {string} docId - The ID of the scan document.
    * @returns {Promise<{phone: string, filename: string, fileId: string}>} A promise that resolves to the phone, filename and fileId.
    * @throws {Error} Throws an error if the document is not found or is missing required fields.
    */
   getScanDetails: async (docId: string): Promise<{phone: string, filename: string, fileId: string}> => {
      const scan = await db.collection<ScanDocument>('scans').findOne(
         { _id: docId },
         { projection: { phone: 1, filename: 1, fileId: 1 } }
      )

      if (!scan || !scan.phone || !scan.filename || !scan.fileId) {
         const message = `Could not find required scan details (phone, filename, fileId) for docId: ${docId}`
         log.error(message)
         throw new Error(message)
      }

      return { phone: scan.phone, filename: scan.filename, fileId: scan.fileId }
   },


   /**
    * Write job progress to scan document
    * @param {object} params - The parameters for recording job progress.
    * @param {string} params.jobId - The job ID (document _id).
    * @param {string} params.queueName - The queue name to use as a field name.
    * @param {JobRecord['status']} params.status - The status of the job.
    * @param {object} [params.payload={}] - The data to store with the record.
    */
   recordJobProgress: async (args: RecordJobProgressArgs): Promise<void> => {
      const { jobId, queueName, status, ...payload } = args

      // Fetch the specific job field from the document first to get existing data.
      const doc = await db.collection<ScanDocument>('scans').findOne(
         { _id: jobId },
         { projection: { [queueName]: 1 } }
      )
      const existingData = doc?.[queueName as keyof ScanDocument] as JobRecord | undefined

      // Merge existing data with the new record to only update the fields that are provided.
      const mergedRecord = {
         ...existingData,
         status,
         timestamp: new Date(),
         ...payload,
      }

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
               phone: '$phone',
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
      try {
         const scan = await db.collection<ScanDocument>('scans').findOne(
            { _id: docId },
            { projection: { [OCR_EXTRACTION]: 1 } }
         )

         const { data } = scan[OCR_EXTRACTION] as OcrExtractionJobCompletedPayload
         if (!data) throw new Error(`No OCR data found for document ${docId}.`)
         return data
      }
      catch (error) {
         log.error(error, `Could not retrieve OCR data for document ${docId}.`)
         throw error
      }
   },


   /**
  * Retrieves the metadata from a specific scan document.
  *
  * @param docId - The ID of the scan document.
  * @returns A promise that resolves to the metadata.
  * @throws An error if the document cannot be found.
  */
   getMetadataFromScan: async (docId: string): Promise<InvoiceMeta> => {
      try {
         // 1. Fetch ONLY the scan-validation sub-document that holds invoice metadata
         const scan = await db.collection<ScanDocument>('scans').findOne(
            { _id: docId },
            { projection: { [SCAN_VALIDATION]: 1 } }
         )

         // 2. Coerce the nested object to our expected payload type
         const payload = scan[SCAN_VALIDATION] as ScanValidationJobCompletedPayload

         // 3. DRY *three-line* build of the meta object -----------------
         //
         //     • META_KEYS  → ['invoiceId', 'supplier', 'date', 'pages']
         //     • .map(...)  → [ ['invoiceId', payload.invoiceId], … ]
         //     • fromEntries → { invoiceId: '…', supplier: '…', date: '…', pages: n }
         //
         //     The final `as InvoiceMeta` is safe because META_KEYS is declared to
         //     satisfy `readonly (keyof InvoiceMeta)[]`, so the resulting object
         //     can have *only* those four keys.
         //
         return Object.fromEntries(
            META_KEYS.map(
               k => [k, payload[k as keyof ScanValidationJobCompletedPayload]]
            )
         ) as InvoiceMeta
      }
      catch (error) {
         const errorMessage = `Could not retrieve metadata for document ${docId}.`
         log.error(error, errorMessage)
         // Preserve the original error as the cause (Node 16+ supports the 'cause' option).
         throw new Error(errorMessage, { cause: error })
      }
   },


   /**
    * Performs an efficient Atlas Search for products using a lemmatized query string,
    * pre-filtering by storeId for performance.
    * @param {string[]} lemmas - The lemmatized search terms.
    * @param {string} storeId - The store to search within.
    * @returns {Promise<ProductCandidate[]>} A promise that resolves to an array of product candidates.
    */
   searchProductsByLemmas: async (lemmas: string[], storeId: string): Promise<ProductCandidate[]> => {
      const pipeline = [
         {
            $search: {
               index: TEXT_SEARCH_INDEX_NAME,
               compound: {
                  filter: [{
                     equals: {
                        value: storeId,
                        path: 'storeId'
                     }
                  }],
                  must: [{
                     text: {
                        query: lemmas,
                        path: 'nameLemmas'
                     }
                  }]
               }
            }
         },
         { $limit: LEMMA_SEARCH_CANDIDATE_LIMIT },
         {
            $project: {
               _id: 1,
               name: 1,
               unit: 1,
               score: { $meta: 'searchScore' },
            },
         },
      ]

      return db.collection<ProductDocument>('products')
         .aggregate<ProductCandidate>(pipeline)
         .toArray()
   },

   
   /**
    * For a given supplier item name, finds the single most recent historical
    * resolution (i.e., a full InventoryItem) from the denormalized 'history' collection.
    * This uses an Atlas Search index for efficient, fuzzy matching.
    *
    * @param {string} storeId - The ID of the store to search within.
    * @param {string} supplierItemName - The item name from the current invoice.
    * @param {number} maxEdits - The maximum fuzzy edit distance to allow.
    * @returns {Promise<Partial<InventoryItem> | null>} A promise that resolves to the single
    *          best historical match, or null if no match is found.
    */
   async resolveHistoryItems(
      storeId: string,
      supplierItemName: string,
      maxEdits: number
   ): Promise<Partial<InventoryItem> | null> {

      const pipeline = [
         {
            '$search': {
               'index': 'search_history_supplier_name',
               'compound': {
                  'filter': [
                     {
                        'equals': {
                           'value': storeId,
                           'path': 'storeId'
                        }
                     }
                  ],
                  'must': [
                     {
                        'text': {
                           'query': supplierItemName,
                           'path': 'supplier_item_name',
                           'fuzzy': {
                              'maxEdits': maxEdits
                           }
                        }
                     }
                  ]
               }
            }
         },
         {
            '$sort': {
               'createdAt': -1
            }
         },
         {
            '$limit': 1
         },
         {
            '$project': {
               // Exclude fields we don't need to apply, keeping the payload lean.
               '_id': 0,
               'storeId': 0,
               'parentDocId': 0,
               'createdAt': 0,
               'score': { '$meta': 'searchScore' } // Include score for potential future use/logging
            }
         }
      ]

      const results = await db.collection('history').aggregate(pipeline).toArray()

      if (!results.length) return null

      // The result from the aggregation is the full history item, which is a Partial<InventoryItem>
      return results[0] as Partial<InventoryItem>
   },
}
