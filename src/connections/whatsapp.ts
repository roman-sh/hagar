import whatsappWeb from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'

const { Client, LocalAuth } = whatsappWeb

export const client = new Client({
   authStrategy: new LocalAuth(),
   puppeteer: {
      headless: true,
      args: [
         '--no-sandbox',
         '--disable-setuid-sandbox',
         '--unhandled-rejections=strict',
         '--disable-dev-shm-usage',
      ],
      handleSIGINT: false,
   }
})

// Add debugging events
client.on('loading_screen', (percent, message) => {
   log.info({ percent, message }, 'WhatsApp loading screen')
})

client.on('authenticated', () => {
   log.info('WhatsApp client authenticated successfully')
})

client.on('auth_failure', (message) => {
   log.error({ message }, 'WhatsApp authentication failed')
})

client.on('ready', () => {
   log.info('WhatsApp client is ready!')
})

client.on('disconnected', (reason) => {
   log.warn({ reason }, 'WhatsApp client disconnected')
})

client.on('change_state', (state) => {
   log.info({ state }, 'WhatsApp client state changed')
})

// @ts-ignore
client.on('qr', (qr) => {
   log.info('QR code received - scan with your phone')
   qrcode.generate(qr, { small: true })
})
