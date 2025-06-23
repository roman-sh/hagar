import { db } from '../../../connections/mongodb'
import { redisClient } from '../../../connections/redis'
import { StoreDocument } from '../../../types/documents'

const TOKEN_CACHE_PREFIX = 'token:rexail:'

/**
 * Retrieves the auth token for a given store, using a Redis cache to avoid unnecessary DB queries.
 * @param storeId The ID of the store.
 * @returns The authentication token, or null if not found.
 */
export async function getStoreToken(storeId: string): Promise<string | null> {
   const cacheKey = `${TOKEN_CACHE_PREFIX}${storeId}`

   // 1. Try to get the token from Redis cache
   const cachedToken = await redisClient.get(cacheKey)
   if (cachedToken) {
      log.debug({ storeId }, `Token found in cache.`)
      return cachedToken
   }

   // 2. If not in cache, get from MongoDB
   log.debug({ storeId }, `Token not in cache, querying database.`)
   const store = await db.collection<StoreDocument>('stores').findOne({ storeId })
   const token = store?.backoffice?.token || null

   // 3. If token found in DB, store it in Redis for next time
   if (token) {
      await redisClient.set(cacheKey, token)
   }

   return token
}

/**
 * Updates the auth token for a given store in both MongoDB and the Redis cache.
 * @param storeId The ID of the store.
 * @param token The new token to save.
 */
export async function updateStoreToken(storeId: string, token: string): Promise<void> {
   const cacheKey = `${TOKEN_CACHE_PREFIX}${storeId}`

   // 1. Update the token in MongoDB
   await db.collection<StoreDocument>('stores').updateOne(
      { storeId },
      { $set: { 'backoffice.token': token } }
   )
   log.info({ storeId }, `Token updated in database.`)

   // 2. Update the token in Redis cache
   await redisClient.set(cacheKey, token)
   log.info({ storeId }, `Token updated in cache.`)
} 