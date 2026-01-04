import './utils/suppress-warnings'
import './utils/global-logger'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { initializeQueues } from './queues-init'
import { initializeDatabase } from './connections/mongodb'
import { initializeRedis } from './connections/redis'
import { initializeS3 } from './connections/s3'
import { client } from "./connections/whatsapp"
// import { pdfUploadHandler } from './api/pdf-upload'
import { configureBullBoard, type BullBoardConfig } from './config/bull-board'
import { initializeDebouncer } from './services/message-debouncer'
import { Message } from "whatsapp-web.js"
import { messageStore } from './services/message-store'
import { phoneQueueManager } from './services/inbound-queues-manager'
import { conversationManager } from './services/conversation-manager'
import { ingestCatalogHandler } from './api/ingest-catalog'


export async function buildApp() {
   log.info('Building application...')
   
   // Initialize services
   await Promise.all([
      initializeDatabase(),
      initializeRedis(),
      initializeS3(),
      client.initialize(), // whatsapp client
      conversationManager.initialize(),
   ])

   initializeQueues()
   initializeDebouncer()

   // Listen for incoming messages
   client.on('message', async (message: Message) => {
      const { number } = await message.getContact()
      log.debug({ from: number, type: message.type }, 'Received WhatsApp message')
      await messageStore.store(message)
      await phoneQueueManager.addMessage(number, { messageId: message.id._serialized })
   })

   // Initialize Hono server app
   const app = new Hono()

   // Allow requests from any origin
   app.use('/api/*', cors())

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

   // We use scan apps to upload PDFs directly to Hagar's whatsapp.
   // Uncomment this if physical scanner + RPi becomes relevant again.
   // app.post('/api/pdf-upload', pdfUploadHandler)

   // Route for the Chrome extension to upload the catalog
   app.post('/api/ingest-catalog', ingestCatalogHandler)

   // Define a health check endpoint
   app.get('/health', (c) => c.json({ status: 'ok' }))

   // Error handling
   app.onError((err, c) => {
      log.error(err, 'Error handling request')
      return c.json({ error: 'Internal server error' }, 500)
   })

   return { app, bullBoardConfig }
}


async function startServer() {
   process.on('SIGINT', shutdown)
   process.on('SIGTERM', shutdown)

   try {
      const { app, bullBoardConfig } = await buildApp()
      const PORT = process.env.PORT || 3000

      // Start the Node.js server
      serve({
         fetch: app.fetch,
         port: Number(PORT)
      })

      log.info(`Server running on port ${PORT}`)
      log.info(
         `Bull Dashboard available at http://localhost:${PORT}${bullBoardConfig.basePath}`
      )
      log.info('Application started successfully')

   } catch (error) {
      log.error(error as Error, 'Application Startup Error')
      await shutdown('ERROR')
   }

   log.info('Application ready - WhatsApp client is stable on Node.js!')
}


// --- Final Graceful Shutdown Handler ---
async function shutdown(signal: string) {
   log.info(`${signal} received. Shutting down gracefully...`)

   const shutdownTimeout = setTimeout(() => {
      log.warn('Shutdown timeout reached. Forcing exit.')
      process.exit(1)
   }, 5000) // 5-second timeout

   try {
      log.info('Attempting to destroy WhatsApp client...')
      await client.destroy()
      log.info('WhatsApp client destroyed successfully.')
      // Add a small delay to allow the browser process to fully close
      await new Promise(resolve => setTimeout(resolve, 2500))
   } catch (error) {
      log.error(error, `Error destroying WhatsApp client during ${signal}`)
   } finally {
      clearTimeout(shutdownTimeout)
      process.exit(signal === 'ERROR' ? 1 : 0)
   }
}


startServer()