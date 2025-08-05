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


/**
 * A type representing the combined details from a scan and its store.
 * Derived from the base document types for better maintainability.
 */
type ScanAndStoreDetails
   = Pick<ScanDocument, 'storeId' | 'fileId' | 'filename' | 'url'>
   & Pick<StoreDocument, 'phone'>


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
    * Cleans the conversational context for a new session. It moves all previous messages
    * for a store to an archive collection, then creates a single summary message from the
    * user's prior inputs to preserve context in a token-efficient manner.
    *
    * @param {string} storeId - The ID of the store for which to clean the context.
    * @returns {Promise<void>}
    */
   cleanContext: async (storeId: string): Promise<void> => {
      const messagesCollection = db.collection<MessageDocument>('messages')
      const archiveCollection = db.collection<MessageDocument>('messages_archive')

      // 1. Find all messages for the store.
      const allMessages = await messagesCollection.find({ storeId }).toArray()
      
      if (!allMessages.length) {
         log.info({ storeId }, 'No previous messages found. Context is already clean.')
         return
      }

      // 2. Archive all messages.
      await archiveCollection.insertMany(allMessages)

      // 3. Find the filename and docId from the last 'scanner' message for context.
      const lastScanMessage = [...allMessages].reverse().find(m => m.name === 'scanner')
      const filename = lastScanMessage?.content?.filename
      const docId = lastScanMessage?.content?.docId

      // 4. Keep only conversational messages (assistant or user) that have plain-string content.
      const convoMessages = allMessages.filter(
         (m) =>
            (m.role === 'user' || m.role === 'assistant')
            && typeof m.content === 'string'
      )
      
      // 5. Delete all original messages from the primary collection.
      await messagesCollection.deleteMany({ storeId })

      // 6. If there were conversational messages, insert a structured summary message.
      if (convoMessages.length) {
         await messagesCollection.insertOne({
            _id: new ObjectId(),
            type: DocType.MESSAGE,
            storeId,
            phone: convoMessages[convoMessages.length - 1].phone, // phone of last message
            role: 'assistant',
            content: {
               note: 'Summary of previous session for context',
               meta: {
                  filename,
                  docId,
                  archivedCount: allMessages.length,
               },
               transcript: convoMessages.map(m => ({ role: m.role, text: m.content as string }))
            },
            createdAt: new Date(),
         })
      }

      log.info(
         { storeId },
         `Context cleaned.\n${allMessages.length} messages archived.\n${convoMessages.length} messages summarized.`
      )
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
    * For a given list of supplier item names, finds the most recent historical
    * resolution (i.e., the inventory_item_id and name) from past finalized invoices.
    * This is used by the history-pass to apply previous matching decisions automatically.
    * It uses a single, efficient aggregation query to perform a bulk lookup.
    *
    * @param {string} storeId - The ID of the store to search within.
    * @param {string[]} supplierItemNames - An array of item names from the current invoice.
    * @returns {Promise<{ [key: string]: Partial<InventoryItem> }>} A promise that resolves to a
    *          map where keys are the supplier item names and values are the partial
    *          InventoryItem objects containing the historical resolution.
    */
   async resolveHistoryItems(
      storeId: string, supplierItemNames: string[]
   ): Promise<{ [key: string]: Partial<InventoryItem> }> {
      const pipeline = [
         // Step 1: Find all documents that might contain the items we need, using an index on storeId.
         {
            $match: {
               storeId: storeId,
               'items.supplier_item_name': { $in: supplierItemNames },
            },
         },
         // Step 2: Sort the parent documents by creation date, newest first.
         // This is crucial for the $group stage to pick the latest item correctly.
         { $sort: { createdAt: -1 } },
         
         // Step 3: Deconstruct the items array from each document into a stream of items.
         { $unwind: '$items' },
         
         // Step 4: Filter the stream of items to only include the ones we are looking for
         // and that have a resolution type, making them a valid historical decision.
         {
            $match: {
               'items.supplier_item_name': { $in: supplierItemNames },
               'items.match_type': { $exists: true, $ne: '' },
            },
         },

         // Step 5: Group by the supplier item name. For each group, take the *first*
         // item encountered. Because of the preceding $sort, this is guaranteed
         // to be the most recent one. We only capture the specific fields needed for resolution.
         {
            $group: {
               _id: '$items.supplier_item_name',
               inventory_item_id: { $first: '$items.inventory_item_id' },
               inventory_item_name: { $first: '$items.inventory_item_name' },
               inventory_item_unit: { $first: '$items.inventory_item_unit' },
               match_type: { $first: '$items.match_type' },
            },
         },
      ]

      const aggregationResult = await db.collection<UpdateDocument>('updates').aggregate(pipeline).toArray()

      // The result is an array like: [{ _id: 'Milk', inventory_item_id: 'P-123', ... }, ... ]
      // We'll transform it into the desired map structure { 'Milk': { inventory_item_id: 'P-123', ... } }
      const results: { [key: string]: Partial<InventoryItem> } = {}
      
      for (const doc of aggregationResult) {
         results[doc._id] = {
            inventory_item_id: doc.inventory_item_id,
            inventory_item_name: doc.inventory_item_name,
            inventory_item_unit: doc.inventory_item_unit,
            match_type: doc.match_type,
         }
      }

      return results
   },
}
