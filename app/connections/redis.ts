import Redis from 'ioredis'
// Alternative: import { createClient } from 'redis'

// Redis client connection - now export as named export
export let redisClient: Redis

export async function initializeRedis(): Promise<Redis> {
   // Use REDIS_URL from env if available, otherwise ioredis defaults to localhost:6379
   redisClient = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL)
      : new Redis()

   // Error handling
   redisClient.on('error', (error) => {
      log.error(error, 'Redis client error')
   })

   // Reconnection event
   redisClient.on('reconnecting', () => {
      log.warn('Redis client reconnecting')
   })

   // Successful connection
   redisClient.on('connect', () => {
      log.info('Redis client connected')
   })

   // Ping to verify connection
   const pingResult = await redisClient.ping()
   log.info({ pingResult }, 'Redis connection verified')

   return redisClient
}
