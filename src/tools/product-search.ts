import { ChatCompletionTool } from 'openai/resources'
import { database } from '../services/db'
import { lemmatizer } from '../services/lemmatizer'
import { ProductCandidate } from '../types/inventory'


export const productSearchSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'productSearch',
      description:
         'Searches the product catalog for multiple text queries to find potential matches. Returns results grouped by the original query.',
      parameters: {
         type: 'object',
         properties: {
            queries: {
               type: 'array',
               items: { type: 'string' },
               description:
                  "An array of search queries (e.g., ['אבוקדו האס', 'אורז בסמטי מלא']).",
            },
            storeId: {
               type: 'string',
               description:
                  'The ID of the store to search within (e.g., "organi_ein_karem").',
            },
         },
         required: ['queries', 'storeId'],
      },
   },
}

export async function productSearch(args: {
   queries: string[]
   storeId: string
}): Promise<Record<string, ProductCandidate[]>> {
   const { queries, storeId } = args

   // 1. Lemmatize all search queries in a single batch
   const lemmatizedQueries = await lemmatizer.batchLemmatize(queries)

   // 2. Create an array of search promises
   const searchPromises = lemmatizedQueries.map(lemmas =>
      database.searchProductsByLemmas(lemmas, storeId)
   )

   // 3. Execute all searches in parallel
   const results = await Promise.all(searchPromises)

   // 4. Map results back to their original queries
   const resultsByQuery = queries.reduce((acc, query, index) => {
      acc[query] = results[index]
      return acc
   }, {} as Record<string, ProductCandidate[]>)

   return resultsByQuery
}
