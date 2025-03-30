import pino from 'pino'

global.log = pino({
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
