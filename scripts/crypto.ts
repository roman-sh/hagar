import 'dotenv/config'
import { cryptoService } from '../src/services/crypto'

function main() {
   const [action, value] = process.argv.slice(2)

   if (!action || !value) {
      console.error('Usage: tsx scripts/crypto.ts <encrypt|decrypt> <string>')
      process.exit(1)
   }

   if (!process.env.ENCRYPTION_KEY) {
      console.error('ENCRYPTION_KEY not found in .env file')
      process.exit(1)
   }

   try {
      if (action === 'encrypt') {
         console.log(cryptoService.encrypt(value))
      } else if (action === 'decrypt') {
         console.log(cryptoService.decrypt(value))
      } else {
         console.error(`Invalid action: ${action}. Use 'encrypt' or 'decrypt'.`)
         process.exit(1)
      }
   } catch (error) {
      console.error(`Error during ${action}:`, error.message)
      process.exit(1)
   }
}

main()