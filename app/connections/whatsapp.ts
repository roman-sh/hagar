// @ts-nocheck

import whatsappWeb from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import path from 'path'

const { Client, LocalAuth } = whatsappWeb

export const client = new Client({
   authStrategy: new LocalAuth(),
   puppeteer: {
      headless: true,
      args: [
         '--no-sandbox',
         '--disable-setuid-sandbox',
         '--unhandled-rejections=strict'
      ]
   }
})

client.on('ready', () => {
   log.info('Whatsapp client is ready!')
})

// @ts-ignore
client.on('qr', qr => {
   qrcode.generate(qr, { small: true })
})

// Create a dedicated file transport for WhatsApp message analysis
const messageAnalysisLogger = pino({
   transport: {
      target: 'pino/file',
      options: {
         destination: 'whatsapp-message-analysis.json',
         mkdir: true,
         sync: true
      }
   }
})

client.on('message', async message => {
   // Log message for analysis
   messageAnalysisLogger.info({ message }, 'WhatsApp message structure analysis');
   
   // Send a simple text response
   await message.reply('This is a test reply. Button functionality is deprecated in whatsapp-web.js.');
})