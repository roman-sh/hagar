import Redis from 'ioredis'
// Alternative: import { createClient } from 'redis'

// Redis client connection - now export as named export
export let redisClient: Redis
export let redisSubscriber: Redis

if (!process.env.REDIS_HOST) throw new Error(
   'REDIS_HOST must be set in environment variables'
)

if (!process.env.REDIS_PORT) throw new Error(
   'REDIS_PORT must be set in environment variables'
)

export async function initializeRedis(): Promise<Redis> {
   const redisOptions = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
   };

   log.info({ redisOptions }, 'Connecting to Redis with options:')

   // ioredis defaults to localhost:6379
   redisClient = new Redis(redisOptions)
   redisSubscriber = new Redis(redisOptions)

   // Error handling
   redisClient.on('error', (error) => {
      log.error(error, 'Redis client error')
   })
   redisSubscriber.on('error', (error) => {
      log.error(error, 'Redis subscriber error')
   })

   // Reconnection event
   redisClient.on('reconnecting', () => {
      log.warn('Redis client reconnecting')
   })
   redisSubscriber.on('reconnecting', () => {
      log.warn('Redis subscriber reconnecting')
   })

   // Successful connection
   redisClient.on('connect', () => {
      log.info('Redis client connected')
   })
   redisSubscriber.on('connect', () => {
      log.info('Redis subscriber connected')
   })

   // Enable keyspace notifications for expired events
   redisClient.config('SET', 'notify-keyspace-events', 'Ex')

   // Subscribe to expired events
   redisSubscriber.subscribe('__keyevent@0__:expired')

   // Ping to verify connection
   const pingResult = await redisClient.ping()
   log.info({ pingResult }, 'Redis connection verified')

   return redisClient
}
