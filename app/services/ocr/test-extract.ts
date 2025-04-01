// @ts-nocheck 
const { extractInvoiceData } = require('./extract')
const fs = require('fs')
const path = require('path')

// Load the actual analysis JSON file
try {
   const analysisFilePath = process.argv[2]
   const analysisData = JSON.parse(fs.readFileSync(analysisFilePath, 'utf8'))

   // Run the extraction function
   const extractedData = extractInvoiceData(analysisData)
   console.log('Extraction successful!')

   // Save the extracted data to a file
   const outputFilePath = path.join(
      path.dirname(analysisFilePath),
      `${path.basename(analysisFilePath, '.json')}_extracted.json`
   )

   fs.writeFileSync(outputFilePath, JSON.stringify(extractedData, null, 2))
   console.log(`Extracted data saved to: ${outputFilePath}`)
} catch (error) {
   console.error('Extraction failed:', error.message)
}
