import pino, { Logger } from 'pino'

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

// Declare global variable
declare global {
   // eslint-disable-next-line no-var
   var log: Logger;
}

// Assign the logger to the global object
global.log = logger