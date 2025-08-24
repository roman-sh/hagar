import pino, { Level } from 'pino'
import pretty from 'pino-pretty'
import { Writable } from 'stream'
import { Logtail } from '@logtail/node'
import { db } from '../connections/mongodb'
import { DocType } from '../types/documents'
import { gpt } from '../services/gpt'
import { database } from '../services/db'

const { BETTERSTACK_SOURCE_TOKEN, BETTERSTACK_ENDPOINT } = process.env

// Validate required env vars
if (!BETTERSTACK_SOURCE_TOKEN) throw new Error(
   'Environment variable BETTERSTACK_SOURCE_TOKEN is required for logging'
)

if (!BETTERSTACK_ENDPOINT) throw new Error(
   'Environment variable BETTERSTACK_ENDPOINT is required for logging'
)

const streams: pino.StreamEntry[] = []

// Stream 1 – always pretty-printed output to local stdout (TTY or not)
streams.push({
   level: (process.env.CONSOLE_LOG_LEVEL as Level) || 'info',
   stream: pretty({
      colorize: true,
      translateTime: 'SYS:d mmm HH:MM:ss.l',
      ignore: 'pid,hostname',
   }),
})

// Stream 2: Better Stack stream (always present)
const logtail = new Logtail(
   BETTERSTACK_SOURCE_TOKEN,
   { endpoint: BETTERSTACK_ENDPOINT }
)

const betterStackStream = new Writable({
   objectMode: true,
   write(chunk, _enc, cb) {
      const logEntry = JSON.parse(chunk.toString())
      const level = pino.levels.labels[logEntry.level] || 'info'
      const message = logEntry.msg
      const { level: _lvl, time, pid, hostname, msg, ...context } = logEntry
      logtail.log(message, level, context)
      cb()
   },
})

process.on('beforeExit', async () => {
   await logtail.flush()
})

streams.push({ level: 'trace', stream: betterStackStream })

// Stream 3: AI Notification Stream
const aiNotificationStream = new Writable({
   objectMode: true,
   write(chunk, _enc, cb) {
      const logEntry = JSON.parse(chunk.toString())
      if (logEntry.notifyPhone) {
         // Fire-and-forget: we call the async function but don't wait for it.
         handleUserNotification(logEntry)
      }
      // Immediately tell pino we're done with this log entry.
      cb()
   },
})

streams.push({ level: 'error', stream: aiNotificationStream })


const logger = pino({ level: 'trace' }, pino.multistream(streams))
;(globalThis as any).log = logger


/**
 * A self-contained, fire-and-forget function to handle sending a user notification.
 * It's designed to be called from a logging stream without blocking it.
 * @param logEntry The log object, which must contain notifyPhone.
 */
async function handleUserNotification(logEntry: Record<string, any>) {
   const { notifyPhone, err, msg } = logEntry
   const storeId = await database.getStoreIdByPhone(notifyPhone)
   
   const content = `${msg}\n\n${JSON.stringify(err, null, 2)}`

   await db.collection('messages').insertOne({
      type: DocType.MESSAGE,
      role: 'user',
      name: 'app',
      phone: notifyPhone,
      content,
      storeId,
      createdAt: new Date()
   })

   // Use a powerful model for error interpretation and trigger the process directly.
   gpt.process({ phone: notifyPhone, model: 'gpt-5' })
}


export default logger 