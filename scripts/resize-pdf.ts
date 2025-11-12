import fs from 'fs/promises'
import path from 'path'
import { pdf } from '../app/services/pdf'

/**
 * A simple script to test the pdf.resize service.
 * Usage: npx tsx scripts/resize-pdf.ts /path/to/your/file.pdf
 */
const run = async () => {
   const inputPath = process.argv[2]
   if (!inputPath) {
      console.log('Please provide a path to a PDF file.')
      process.exit(1)
   }

   const inputFileBuffer = await fs.readFile(inputPath)

   console.log(`Resizing PDF: ${inputPath}...`)

   const outputFileBuffer = await pdf.resize(inputFileBuffer)

   const dir = path.dirname(inputPath)
   const filename = path.basename(inputPath, '.pdf')
   const outputPath = path.join(dir, `${filename}_resized.pdf`)

   await fs.writeFile(outputPath, outputFileBuffer)

   console.log(`✅ Resized PDF saved to: ${outputPath}`)
}

run() 