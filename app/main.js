import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import { Hono } from 'hono'
import { initializeQueues } from './queues.js'
import { initializeDatabase } from './connections/mongodb.js'
import { initializeRedis } from './connections/redis.js'
import { initializeS3 } from './connections/s3.js'
import { pdfUploadHandler } from './api/pdf-upload.js'
import { configureBullBoard } from './config/bull-board.js'


try {
   // Initialize database connection
   await initializeDatabase()
   await initializeRedis()
   await initializeS3()

   // Initialize all queues with their processors
   initializeQueues()

   const app = new Hono()

   // Set up Bull Board
   const { serverAdapter, basePath } = configureBullBoard()

   // Register Bull Board routes
   app.route(basePath, serverAdapter.registerPlugin())

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
   
   // In Bun, you can pass the Hono app directly to Bun.serve
   Bun.serve({
      fetch: app.fetch,
      port: PORT
   })
   
   log.info(`Server running on port ${PORT}`)
   log.info(`Bull Dashboard available at http://localhost:${PORT}${basePath}`)
   log.info('Application started successfully')

} catch (error) {
   log.error(error, 'Application Error')
}
