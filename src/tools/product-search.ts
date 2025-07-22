import { ChatCompletionTool } from 'openai/resources'
import { db } from '../connections/mongodb'
import { lemmatizer } from '../services/lemmatizer'
import { ProductCandidate } from '../types/inventory'
import { TEXT_SEARCH_INDEX_NAME } from '../config/settings'

const MAX_CANDIDATES = 3

export const productSearchSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'productSearch',
      description:
         'Searches the product catalog for a given text query to find potential matches.',
      parameters: {
         type: 'object',
         properties: {
            query: {
               type: 'string',
               description:
                  "The user's search query (e.g., 'organic eggs', 'whole milk').",
            },
            storeId: {
               type: 'string',
               description:
                  'The ID of the store to search within (e.g., "organi_ein_karem").',
            },
         },
         required: ['query', 'storeId'],
      },
   },
}

export async function productSearch(args: {
   query: string
   storeId: string
}): Promise<ProductCandidate[]> {
   const { query, storeId } = args

   // 1. Lemmatize the search query
   const queryLemmas = await lemmatizer.batchLemmatize([query])

   // 2. Build the Atlas Search aggregation pipeline
   const pipeline = [
      {
         $search: {
            index: TEXT_SEARCH_INDEX_NAME,
            text: {
               query: queryLemmas[0],
               path: 'nameLemmas',
            },
         },
      },
      {
         $match: {
            storeId: storeId,
         },
      },
      {
         $limit: MAX_CANDIDATES,
      },
      {
         $project: {
            _id: 1,
            name: 1,
            unit: 1,
            score: { $meta: 'searchScore' },
         },
      },
   ]

   // 3. Execute the search
   const collection = db.collection('products')
   const candidates = (await collection
      .aggregate(pipeline)
      .toArray()) as ProductCandidate[]

   return candidates
} 