import { createBullBoard } from '@bull-board/api'
import { BullAdapter } from '@bull-board/api/bullAdapter.js'
import { HonoAdapter } from '@bull-board/hono'
import { serveStatic as nodeServeStatic } from '@hono/node-server/serve-static'
import { queuesMap } from '../queues.js'

/**
 * Configure Bull Board with Hono adapter
 * @returns {HonoAdapter} The configured server adapter
 */
export function configureBullBoard() {
   const basePath = '/ui'
   
   // Create Bull Board with Node.js serveStatic
   const serverAdapter = new HonoAdapter(nodeServeStatic)
   serverAdapter.setBasePath(basePath)

   // Create adapters for each queue
   const queueAdapters = Object.values(queuesMap).map(
      queue => new BullAdapter(queue)
   )

   createBullBoard({
      queues: queueAdapters,
      serverAdapter
   })

   return {
      serverAdapter,
      basePath
   }
} 