import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import express from 'express'
import { queuesMap, initializeQueues } from './queues.js'
import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter.js'
import { ExpressAdapter } from '@bull-board/express'
import { initializeDatabase } from './db/connection.js'
import { initializeRedis } from './db/redis.js'

const app = express()
app.use(express.json())

try {
   // Initialize database connection
   await initializeDatabase()
   await initializeRedis()

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

   // Define a health check endpoint
   app.get('/health', (req, res) => {
      res.json({ status: 'ok' })
   })

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
