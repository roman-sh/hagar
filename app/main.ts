/// <reference types="bun-types" />
import './utils/suppress-warnings.ts'
import './utils/global-logger.ts'
import { Hono } from 'hono'
import { initializeQueues } from './queues.ts'
import { initializeDatabase } from './connections/mongodb.ts'
import { initializeRedis } from './connections/redis.ts'
import { initializeS3 } from './connections/s3.ts'
import { pdfUploadHandler } from './api/pdf-upload'
import { configureBullBoard, type BullBoardConfig } from './config/bull-board'

try {
   // Initialize database connection
   await initializeDatabase()
   await initializeRedis()
   await initializeS3()

   // Initialize all queues with their processors
   initializeQueues()

   const app = new Hono()

   // Set up Bull Board
   const bullBoardConfig: BullBoardConfig = configureBullBoard()

   // Register Bull Board routes
   app.route(bullBoardConfig.basePath, bullBoardConfig.serverAdapter.registerPlugin())

   // API routes
   app.post('/api/pdf-upload', pdfUploadHandler)   // app's entry point

   // Define a health check endpoint
   app.get('/health', (c) => c.json({ status: 'ok' }))

   // Error handling
   app.onError((err, c) => {
      log.error(err, 'Error handling request')
      return c.json({ error: 'Internal server error' }, 500)
   })
   
   // Start the HTTP server
   const PORT = process.env.PORT || 3000
   
   // Start the Bun server
   Bun.serve({
      fetch: app.fetch,
      port: PORT as number
   })
   
   log.info(`Server running on port ${PORT}`)
   log.info(`Bull Dashboard available at http://localhost:${PORT}${bullBoardConfig.basePath}`)
   log.info('Application started successfully')

} catch (error) {
   log.error(error as Error, 'Application Error')
} 