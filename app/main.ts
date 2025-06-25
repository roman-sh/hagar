import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { initializeQueues } from './queues.js'
import { initializeDatabase } from './connections/mongodb.js'
import { initializeRedis } from './connections/redis.js'
import { initializeS3 } from './connections/s3.js'
import { client } from "./connections/whatsapp.js"
import { pdfUploadHandler } from './api/pdf-upload.js'
import { configureBullBoard, type BullBoardConfig } from './config/bull-board.js'
import { initializeDebouncer } from './services/message-debouncer.js'
import { Message } from "whatsapp-web.js"
import { messageStore } from './services/message-store.js'
import { phoneQueueManager } from './services/phone-queues-manager.js'

export async function buildApp() {
   log.info('Building application...')
   
   // Initialize services
   await Promise.all([
      initializeDatabase(),
      initializeRedis(),
      initializeS3(),
      client.initialize(), // whatsapp client
   ])

   initializeQueues()
   initializeDebouncer()

   // Listen for incoming messages
   client.on('message', async (message: Message) => {
      log.debug({ from: message.from, type: message.type }, 'Received WhatsApp message')
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

// --- Conditional Server Start ---
// The following block allows this file to have a dual personality.
//
// 1. If the file is executed directly (e.g., `node dist/bundle.js` or `tsx app/main.ts`),
//    the `if` condition will be true, and the `startServer()` function will be called,
//    launching the application server as normal. This is the behavior for `npm start` and `npm run dev`.
//
// 2. If the file is imported by another module (e.g., a test file like `test/rexail-api.test.ts`),
//    the `if` condition will be false. This allows us to import `buildApp` to create an
//    in-memory instance of the application for testing without actually starting a live server.
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
   startServer()
}
