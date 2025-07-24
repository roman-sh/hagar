import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'
import { lemmatizer } from '../services/lemmatizer'
import { ProductCandidate } from '../types/inventory'

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
   const lemmasBatch = await lemmatizer.batchLemmatize([query])
   const lemmas = lemmasBatch[0]

   // 2. Execute the search using the centralized, efficient db function
   return database.searchProductsByLemmas(lemmas, storeId)
}
