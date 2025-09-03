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
         },
         required: ['queries'],
      },
   },
}

export async function productSearch(args: {
   queries: string[]
   phone: string
}): Promise<Record<string, ProductCandidate[]>> {
   const { queries, phone } = args

   // 1. Get storeId from the phone number
   const storeId = await database.getStoreIdByPhone(phone)

   // 2. Lemmatize all search queries in a single batch
   const lemmatizedQueries = await lemmatizer.batchLemmatize(queries)

   // 3. Create an array of search promises
   const searchPromises = lemmatizedQueries.map(lemmas =>
      database.searchProductsByLemmas(lemmas, storeId)
   )

   // 4. Execute all searches in parallel
   const results = await Promise.all(searchPromises)

   // 5. Map results back to their original queries
   const resultsByQuery = queries.reduce((acc, query, index) => {
      acc[query] = results[index]
      return acc
   }, {} as Record<string, ProductCandidate[]>)

   return resultsByQuery
}
