import { createClient } from 'redis'
// Alternative: import Redis from 'ioredis'

// Redis client connection
let redisClient

export async function initializeRedis() {
   const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

   redisClient = createClient({
      url: redisUrl
   })

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

   // Connect to Redis server
   await redisClient.connect()

   // Ping to verify connection
   const pingResult = await redisClient.ping()
   log.info({ pingResult }, 'Redis connection verified')

   return redisClient
}

// Export the client (it will be empty until initializeRedis is called)
export default redisClient
