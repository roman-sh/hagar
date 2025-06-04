import pino from 'pino'

// Create the logger
const logger = pino({
   transport: {
      target: 'pino-pretty',
      options: {
         colorize: true,
         ignore: 'pid,hostname',
         translateTime: 'SYS:HH:MM:ss.l'
      }
   },
   level: process.env.LOG_LEVEL || 'info'
})

// Assign the logger to the global object
;(globalThis as any).log = logger
