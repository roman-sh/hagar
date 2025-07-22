import rexailApi from './api'
import { RexailObfuscatedCatalogResponse, RexailProduct } from './rexail'
import { database } from '../../services/db'
import { DocType, ProductDocument } from '../../types/documents'
import { CatalogService } from '../../types/inventory'
import crypto from 'crypto'
import { openai } from '../../connections/openai'
import {
   DEFAULT_SYNC_COOLDOWN_MINUTES,
   EMBEDDING_MODEL_CONFIG,
} from '../../config/settings'
import { lemmatizer } from '../../services/lemmatizer'

/**
 * Service object for interacting with the Rexail catalog.
 */
export const catalog: CatalogService = {
   /**
    * Syncs the Rexail catalog for a given store with the local database.
    *
    * This function performs an intelligent, atomic synchronization:
    * 1. Fetches the fresh catalog from the Rexail API and the existing products from the local DB.
    * 2. Compares the two lists to identify new products to add, existing products to update
    *    (based on a fingerprint hash), and stale products to delete.
    * 3. Generates vector embeddings ONLY for the new and updated products.
    * 4. Executes the necessary add, update, and delete operations in efficient batches.
    *
    * @param {string} storeId - The ID of the store to synchronize.
    * @param {object} [options] - Optional parameters.
    * @param {boolean} [options.force=false] - If true, the sync will bypass the cooldown period.
    */
   async sync(storeId: string, options: { force?: boolean } = {}) {
      try {
         // 1. Get store and perform throttling check
         const store = await database.getStore(storeId)

         if (!options.force) {
            const cooldownMinutes = store.catalog?.syncCooldownMinutes || DEFAULT_SYNC_COOLDOWN_MINUTES
            const lastSync = store.catalog?.lastSync

            if (lastSync && (new Date().getTime() - new Date(lastSync).getTime()) < cooldownMinutes * 60 * 1000) {
               log.info({ storeId, lastSync }, `Catalog sync throttled. Last sync was less than ${cooldownMinutes} minutes ago.`)
               return
            }
         }

         // 2. Get the fresh catalog from Rexail and existing from DB
         log.debug({ storeId }, 'Fetching fresh catalog from API and existing from DB.')
         const [rexailProducts, existingProducts] = await Promise.all([
            fetch(storeId),
            database.getProductsByStoreId(storeId, { projection: { productId: 1, fingerprint: 1 } }),
         ])
         log.debug({ storeId, rexailCount: rexailProducts.length, dbCount: existingProducts.length }, 'Catalogs fetched.')

         // 3. Create maps for efficient lookups
         const existingProductsMap = new Map(existingProducts.map(p => [p.productId, p.fingerprint]))
         const rexailProductsMap = new Map(rexailProducts.map((p: RexailProduct) => [p.nonObfuscatedId, p]))

         // 4. Determine changes
         const toAdd: RexailProduct[] = []
         const toUpdate: RexailProduct[] = []
         const toDeleteIds: number[] = []

         // Find products to add or update
         for (const rexailProduct of rexailProducts) {
            const existingFingerprint = existingProductsMap.get(rexailProduct.nonObfuscatedId)
            if (!existingFingerprint) {
               toAdd.push(rexailProduct)
            }
            else {
               const newFingerprint = getProductFingerprint(rexailProduct)
               if (newFingerprint !== existingFingerprint) {
                  toUpdate.push(rexailProduct)
               }
            }
         }

         // Find products to delete
         for (const existingProduct of existingProducts) {
            if (!rexailProductsMap.has(existingProduct.productId)) {
               toDeleteIds.push(existingProduct.productId)
            }
         }

         if (toAdd.length === 0 && toUpdate.length === 0 && toDeleteIds.length === 0) {
            log.info({ storeId }, 'Catalog is already up to date.')
            await database.updateStore(storeId, { catalog: { ...store.catalog, lastSync: new Date() } })
            return
         }

         log.debug({ storeId, add: toAdd.length, update: toUpdate.length, remove: toDeleteIds.length }, 'Catalog changes identified.')

         // 5. Process embeddings and lemmas for new and updated products
         const productsToProcess = [...toAdd, ...toUpdate]
         let embeddingsMap = new Map<number, number[]>()
         let lemmasMap = new Map<number, string[]>()

         if (productsToProcess.length > 0) {
            log.info({ storeId, count: productsToProcess.length }, 'Generating embeddings and lemmas for new/updated products...')
            const textsToProcess = productsToProcess.map(p => p.fullName)

            const embeddingsStart = Date.now()
            const embeddings = await createEmbedding(textsToProcess)
            log.info({ storeId, durationMs: Date.now() - embeddingsStart }, 'Finished generating embeddings.')

            const lemmasStart = Date.now()
            const lemmas = await lemmatizer.batchLemmatize(textsToProcess)
            log.info({ storeId, durationMs: Date.now() - lemmasStart }, 'Finished generating lemmas.')

            embeddingsMap = new Map(productsToProcess.map((p: RexailProduct, i) => [p.nonObfuscatedId, embeddings[i]]))
            lemmasMap = new Map(productsToProcess.map((p: RexailProduct, i) => [p.nonObfuscatedId, lemmas[i]]))
         }

         // 6. Execute database operations
         const promises = []

         // Add new products
         if (toAdd.length > 0) {
            const newDocs = toAdd.map(p =>
               transformProduct(
                  p,
                  storeId,
                  embeddingsMap.get(p.nonObfuscatedId),
                  lemmasMap.get(p.nonObfuscatedId)
               )
            )
            promises.push(database.insertProducts(newDocs))
            log.debug({ storeId, count: newDocs.length }, 'Adding new products.')
         }

         // Update existing products
         if (toUpdate.length > 0) {
            const updatedDocs = toUpdate.map(p =>
               transformProduct(
                  p,
                  storeId,
                  embeddingsMap.get(p.nonObfuscatedId),
                  lemmasMap.get(p.nonObfuscatedId)
               )
            )
            promises.push(database.updateProducts(updatedDocs))
            log.debug({ storeId, count: updatedDocs.length }, 'Updating existing products.')
         }

         // Delete stale products
         if (toDeleteIds.length > 0) {
            promises.push(database.deleteProductsByIds(storeId, toDeleteIds))
            log.debug({ storeId, count: toDeleteIds.length }, 'Deleting stale products.')
         }

         const dbUpdateStart = Date.now()
         await Promise.all(promises)
         const durationMs = Date.now() - dbUpdateStart

         const opCount = toAdd.length + toUpdate.length + toDeleteIds.length
         log.info({ storeId, durationMs, count: opCount }, 'Finished updating products in DB.')

         // 7. Update the store's last sync timestamp
         await database.updateStore(storeId, {
            catalog: { ...store.catalog, lastSync: new Date() },
         })

         log.info({ storeId, added: toAdd.length, updated: toUpdate.length, removed: toDeleteIds.length }, 'Catalog sync complete.')
      }
      catch (error) {
         log.error(error, `Catalog sync failed for storeId: ${storeId}`)
         throw error
      }
   },
}

// ===================================================================================
// Private Helper Functions
// ===================================================================================

/**
 * Fetches the full, store-specific product catalog from the Rexail API.
 * This was previously named 'getObfuscated'.
 * @param {string} storeId - The ID of the store for which to fetch the catalog.
 * @returns {Promise<RexailProduct[]>} A promise that resolves to the array of products.
 */
async function fetch(storeId: string): Promise<RexailProduct[]> {
   log.info({ storeId }, 'Fetching catalog from Rexail API.')

   const response = await rexailApi.get<RexailObfuscatedCatalogResponse>('catalog/obfuscated/get', {
      params: {
         inheritFromMaster: false,
      },
      storeId,
   })

   log.info({ storeId, productCount: response.data.data.length }, 'Successfully fetched catalog.')
   return response.data.data
}

/**
 * Extracts all valid barcodes from a raw Rexail product object.
 * A barcode is considered any numeric sequence of 7 or more digits found
 * in several candidate fields.
 * @param {RexailProduct} product - The raw product object from the Rexail API.
 * @returns {string[]} A unique array of found barcode strings.
 */
const extractBarcodes = (product: RexailProduct): string[] => {
   const candidates: (string | null)[] = [
      product.upcCode,
      product.product?.upcCode,
      product.productExternalId,
   ]
   const barcodes = new Set<string>()
   const barcodeRegex = /\d{7,}/g

   for (const candidate of candidates) {
      if (typeof candidate === 'string') {
         const matches = candidate.match(barcodeRegex)
         if (matches) {
            matches.forEach(match => barcodes.add(match))
         }
      }
   }

   return Array.from(barcodes)
}

/**
 * Creates a deterministic "fingerprint" of a single product based on its
 * relevant fields. This is used to quickly check if a product has been updated.
 * @param {RexailProduct} product - The product from the Rexail API.
 * @returns {string} An MD5 hash representing the product's state.
 */
const getProductFingerprint = (product: RexailProduct): string => {
   const simplified = {
      id: product.nonObfuscatedId,
      name: product.fullName,
      description: product.productExtraDetails,
      unit: product.productSellingUnits?.[0]?.sellingUnit?.name,
      barcodes: extractBarcodes(product),
   }
   return crypto.createHash('md5').update(JSON.stringify(simplified)).digest('hex')
}

/**
 * Transforms a raw Rexail product object into our standardized ProductDocument schema.
 * @param {RexailProduct} product - The raw product from the Rexail API.
 * @param {string} storeId - The ID of the store this product belongs to.
 * @param {number[]} embedding - The vector embedding for the product name.
 * @returns {ProductDocument} The product document ready for database insertion.
 */
const transformProduct = (
   product: RexailProduct,
   storeId: string,
   embedding: number[],
   nameLemmas: string[]
): ProductDocument => ({
   _id: `${DocType.PRODUCT}:${storeId}:${product.nonObfuscatedId}`,
   type: DocType.PRODUCT,
   storeId,
   productId: product.nonObfuscatedId,
   name: product.fullName,
   nameLemmas,
   description: product.productExtraDetails,
   unit: product.productSellingUnits?.[0]?.sellingUnit?.name,
   barcodes: extractBarcodes(product),
   embedding,
   fingerprint: getProductFingerprint(product),
   createdAt: new Date(),
})

/**
 * Generates vector embeddings for an array of texts using OpenAI's API.
 * @param {string[]} texts - An array of strings to be embedded.
 * @returns {Promise<number[][]>} A promise that resolves to an array of embedding vectors.
 */
const createEmbedding = async (texts: string[]): Promise<number[][]> => {
   const response = await openai.embeddings.create({
      input: texts,
      ...EMBEDDING_MODEL_CONFIG,
   })
   return response.data.map(d => d.embedding)
}