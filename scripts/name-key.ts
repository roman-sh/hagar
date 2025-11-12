import 'dotenv/config'
import { createCanonicalNameKey } from '../src/utils/string-utils'

function main() {
   const [value] = process.argv.slice(2)

   if (!value) {
      console.error('Usage: npx tsx scripts/name-key.ts <string>')
      process.exit(1)
   }

   try {
      console.log(createCanonicalNameKey(value))
   } catch (error) {
      console.error(`Error during key generation:`, error.message)
      process.exit(1)
   }
}

main()
