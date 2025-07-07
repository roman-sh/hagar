import { PassArgs } from "../../types/inventory";
import { H } from '../../config/constants'
import { openai } from "../../connections/openai"
import { EMBEDDING_MODEL_CONFIG, VECTOR_SEARCH_INDEX_NAME } from "../../config/settings"
import { db } from "../../connections/mongodb"
import { ProductDocument } from "../../types/documents"


/**
 * Performs a vector-based matching pass to find potential candidates for unresolved items.
 *
 * This pass targets any item in the document that has a name but has not yet been
 * matched to a product in the catalog. Its primary goal is not to find a definitive
 * match, but to generate a small, high-quality list of potential candidates that
 * can be passed to a subsequent AI-driven pass (`aiPass`) for final resolution.
 *
 * --- Core Strategy ---
 * 1.  **Batch Processing**: It gathers all unresolved item names and generates their
 *     vector embeddings in a single, efficient batch call to the OpenAI API.
 * 2.  **Parallel Execution**: It executes all the individual vector search queries
 *     against the MongoDB collection concurrently using `Promise.all`, maximizing throughput.
 * 3.  **Exact Search**: It uses an exact nearest neighbor (ENN) search (`exact: true`)
 *     to guarantee the highest possible accuracy for the candidate list, which is
 *     feasible and desirable for a moderately-sized product catalog.
 * 4.  **Candidate Attachment**: The top 3 candidates found for each item are attached
 *     to the item's `candidates` property, overwriting any that may have existed previously.
 *     This ensures the subsequent `aiPass` always works with the most relevant data.
 *
 * @param {PassArgs} args - An object containing the document to be mutated, storeId, and docId.
 * @returns {Promise<void>} A promise that resolves when the pass is complete.
 */
export const vectorPass = async (
   { doc, storeId, docId }: PassArgs
): Promise<void> => {
   const passStarted = Date.now()

   // 1. Identify all unresolved items that have a name we can search for.
   const itemsToSearch = doc.items.filter(
      item => !item[H.INVENTORY_ITEM_ID] && item[H.SUPPLIER_ITEM_NAME]
   )

   if (!itemsToSearch.length) {
      log.info({ docId }, 'vectorPass: No items to process.')
      return
   }

   log.info({ docId, count: itemsToSearch.length }, 'vectorPass: Starting pass.')

   // 2. Batch-generate embeddings for all item names.
   const itemNames = itemsToSearch.map(item => item[H.SUPPLIER_ITEM_NAME] as string)
   const embeddingsGenerationStart = Date.now()
   const embeddings = await createEmbedding(itemNames)
   log.info(
      { docId, durationMs: Date.now() - embeddingsGenerationStart },
      'vectorPass: Embeddings generated.'
   )

   // 3. Execute all vector searches in parallel.
   log.info({ docId }, 'vectorPass: Executing vector searches...')
   const searchStart = Date.now()
   const searchPromises = itemsToSearch.map((item, index) => {
      const queryVector = embeddings[index]
      return db.collection<ProductDocument>('products').aggregate([
         {
            $vectorSearch: {
               index: VECTOR_SEARCH_INDEX_NAME,
               path: 'embedding',
               queryVector,
               exact: true,
               limit: 3,
            },
         },
         {
            $project: {
               _id: 1,
               name: 1,
               unit: 1,
            },
         },
      ]).toArray()
   })

   const searchResults = await Promise.all(searchPromises)
   log.info({ docId, durationMs: Date.now() - searchStart }, 'vectorPass: Vector searches completed.')

   // 4. Mutate the document by attaching the candidates to each item.
   itemsToSearch.forEach((item, index) => {
   const candidates = searchResults[index]
      item.candidates = candidates.map(c => ({
         productId: c._id,
         name: c.name,
         unit: c.unit,
      }))
   })

   log.info(
      {
         docId,
         itemsProcessed: itemsToSearch.length,
         durationMs: Date.now() - passStarted
      },
      'vectorPass: Finished processing items.'
   )
}

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