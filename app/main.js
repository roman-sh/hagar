import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import express from 'express'
import { queuesMap, initializeQueues } from './queues.js'
import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter.js'
import { ExpressAdapter } from '@bull-board/express'
import { initializeDatabase } from './connections/mongodb.js'
import { initializeRedis } from './connections/redis.js'
import { initializeS3 } from './connections/s3.js'
import { pdfUploadHandler } from './api/pdf-upload.js'
import { errorHandler } from './api/error-handler.js'


const app = express()
app.use(express.json())

try {
   // Initialize database connection
   await initializeDatabase()
   await initializeRedis()
   await initializeS3()

   // Initialize all queues with their processors
   initializeQueues()

   // Set up Bull Board
   const serverAdapter = new ExpressAdapter()
   serverAdapter.setBasePath('/ui')

   // Create adapters for each queue
   const queueAdapters = Object.values(queuesMap).map(
      (queue) => new BullAdapter(queue)
   )

   createBullBoard({
      queues: queueAdapters,
      serverAdapter
   })

   app.use('/ui', serverAdapter.getRouter())
   app.post('/api/pdf-upload', pdfUploadHandler)

   // Define a health check endpoint
   app.get('/health', (req, res) => {
      res.json({ status: 'ok' })
   })

   // Error handling middleware (must be last)
  app.use(errorHandler)

   // Start the HTTP server
   const PORT = process.env.PORT || 3000
   app.listen(PORT, () => {
      log.info(`Server running on port ${PORT}`)
      log.info(`Bull Dashboard available at http://localhost:${PORT}/ui`)
   })

   log.info('Application started successfully')
} catch (error) {
   log.error(error, 'Fatal error')
}
