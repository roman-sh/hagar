import pino, { Level } from 'pino'
import pretty from 'pino-pretty'
import { Writable } from 'stream'
import { Logtail } from '@logtail/node'

const { BETTERSTACK_SOURCE_TOKEN, BETTERSTACK_ENDPOINT } = process.env

// Validate required env vars
if (!BETTERSTACK_SOURCE_TOKEN) throw new Error(
  'Environment variable BETTERSTACK_SOURCE_TOKEN is required for logging'
)

if (!BETTERSTACK_ENDPOINT) throw new Error(
  'Environment variable BETTERSTACK_ENDPOINT is required for logging'
)

const streams: pino.StreamEntry[] = []

// Stream 1: Pretty print to the console
streams.push({
  level: (process.env.CONSOLE_LOG_LEVEL as Level) || 'info',
  stream: pretty({
    colorize: true,
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname',
  }),
})

// Stream 2: Better Stack stream (always present)
const logtail = new Logtail(BETTERSTACK_SOURCE_TOKEN, { endpoint: BETTERSTACK_ENDPOINT })

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

const logger = pino({ level: 'trace' }, pino.multistream(streams))
;(globalThis as any).log = logger
export default logger 