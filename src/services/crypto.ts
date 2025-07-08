import 'dotenv/config'
import crypto from 'crypto'

const ALGORITHM = 'aes-192-cbc'

if (!process.env.ENCRYPTION_KEY) {
   throw new Error('ENCRYPTION_KEY is not defined in the environment variables.')
}

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'base64')
const IV_LENGTH = 16

function encrypt(text: string): string {
   const iv = crypto.randomBytes(IV_LENGTH)
   const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
   let encrypted = cipher.update(text, 'utf8', 'hex')
   encrypted += cipher.final('hex')
   return `${iv.toString('hex')}:${encrypted}`
}

function decrypt(text: string): string {
   const parts = text.split(':')
   const iv = Buffer.from(parts.shift()!, 'hex')
   const encryptedText = Buffer.from(parts.join(':'), 'hex')
   const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
   let decrypted = decipher.update(encryptedText)
   decrypted = Buffer.concat([decrypted, decipher.final()])
   return decrypted.toString()
}

export const cryptoService = {
   encrypt,
   decrypt,
} 