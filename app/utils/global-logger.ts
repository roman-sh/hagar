import pino from 'pino'

// Create the logger
const logger = pino({
   transport: {
      target: 'pino-pretty',
      options: {
         colorize: true,
         ignore: 'pid,hostname',
         translateTime: 'SYS:HH:MM:ss'
      }
   },
   level: process.env.LOG_LEVEL || 'debug'
})

// Assign the logger to the global object
global.log = logger 