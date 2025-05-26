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
import { initializeDebouncer } from './services/message-debouncer.ts'
import { client } from "./connections/whatsapp"
import { Message } from "whatsapp-web.js"
import { messageStore } from './services/message-store.ts'
import { phoneQueueManager } from './services/phone-queues-manager.ts'


try {
   // Initialize database connection
   await initializeDatabase()
   await initializeRedis()
   await initializeS3()
   await client.initialize()

   // Initialize all queues with their processors
   initializeQueues()
   initializeDebouncer()

   // Listen for incoming messages
   client.on('message', async (message: Message) => {
      log.info({ from: message.from, type: message.type }, 'Received WhatsApp message')
      const messageId = messageStore.store(message)
      const phone = message.from.split('@')[0] // Extract phone number
      
      await phoneQueueManager.addMessage(phone, { messageId })
   })

   // Initialize Hono server app
   const app = new Hono()

   // Set up Bull Board
   const bullBoardConfig: BullBoardConfig = configureBullBoard()

   // Register Bull Board routes
   app.route(
      bullBoardConfig.basePath,
      bullBoardConfig.serverAdapter.registerPlugin()
   )

   // Add redirect for trailing slash
   bullBoardConfig.setupRedirect(app)

   // API routes
   app.post('/api/pdf-upload', pdfUploadHandler) // app's entry point

   // Define a health check endpoint
   app.get('/health', (c) => c.json({ status: 'ok' }))

   // Error handling
   app.onError((err, c) => {
      log.error(err, 'Error handling request')
      return c.json({ error: 'Internal server error' }, 500)
   })

   const PORT = process.env.PORT || 3000

   // Start the Bun server
   Bun.serve({
      fetch: app.fetch,
      port: PORT as number
   })

   log.info(`Server running on port ${PORT}`)
   log.info(
      `Bull Dashboard available at http://localhost:${PORT}${bullBoardConfig.basePath}`
   )
   log.info('Application started successfully')

   // Graceful shutdown handling
   const gracefulShutdown = async (signal: string) => {
      log.info({ signal }, 'Received shutdown signal, starting graceful shutdown...')
      
      try {
         // Close WhatsApp client gracefully
         log.info('Closing WhatsApp client...')
         await client.destroy()
         log.info('WhatsApp client closed')
         
         // Give time for any pending operations
         await new Promise(resolve => setTimeout(resolve, 1000))
         
         log.info('Graceful shutdown completed')
         process.exit(0)
      } catch (error) {
         log.error(error as Error, 'Error during graceful shutdown')
         process.exit(1)
      }
   }

   // Handle shutdown signals
   process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
   process.on('SIGINT', () => gracefulShutdown('SIGINT'))
   process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')) // nodemon restart

} catch (error) {
   log.error(error as Error, 'Application Error')
}
