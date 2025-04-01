// @ts-nocheck 
// =================================================================
// Script to analyze documents with Azure Document Intelligence
// This script submits a document to Azure, processes it using the
// prebuilt invoice model, and saves the raw analysis results
// =================================================================

// Load environment variables from .env file (API key and endpoint)
require('dotenv').config()

// Import required packages
const fs = require('fs')
const path = require('path')
const {
   DocumentAnalysisClient,
   AzureKeyCredential
} = require('@azure/ai-form-recognizer')
const { extractInvoiceData } = require('./extract')

// Get Azure Document Intelligence credentials from environment variables
const endpoint = process.env.FORM_RECOGNIZER_ENDPOINT || ''
const apiKey = process.env.FORM_RECOGNIZER_API_KEY || ''

// Create the Document Intelligence client with API key authentication
const client = new DocumentAnalysisClient(
   endpoint,
   new AzureKeyCredential(apiKey)
)

/**
 * Main function to analyze a document using the prebuilt invoice model
 *
 * @param {string} filePath - Path to the document file to analyze
 * @returns {Object} - The analysis result from Azure Document Intelligence
 */
async function analyzeInvoice(filePath) {
   try {
      console.log(`Analyzing document: ${filePath}`)

      // Read the input file into a buffer
      const fileBuffer = fs.readFileSync(filePath)

      // Submit the document to Azure Document Intelligence
      // We use the prebuilt-invoice model which is specialized for invoice processing
      console.log('Submitting document for analysis...')
      const poller = await client.beginAnalyzeDocument(
         'prebuilt-invoice',
         fileBuffer,
         {
            locale: 'he', // Explicitly specify Hebrew language for better results with Hebrew documents
            features: ['ocrHighResolution'] // Enable high-resolution OCR for better quality and fewer artifacts
         }
      )

      // Wait for the Azure analysis to complete (may take 10-30 seconds)
      console.log('Waiting for analysis to complete...')
      const result = await poller.pollUntilDone()

      // Save the complete analysis result to a JSON file
      // This contains ALL the data including document layout, text content, and extracted fields
      const resultPath = `${path.parse(filePath).name}_analysis.json`
      fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
      console.log(`Analysis completed successfully`)
      console.log(`Results saved to: ${resultPath}`)

      // Extract structured data from the analysis result
      console.log('Extracting structured data...')
      const extractedData = extractInvoiceData(result)

      // Save the extracted data
      const extractedPath = `${path.parse(filePath).name}_extracted.json`
      fs.writeFileSync(extractedPath, JSON.stringify(extractedData, null, 2))
      console.log(`Extracted data saved to: ${extractedPath}`)

      return result
   } catch (error) {
      console.error('Error analyzing document:', error)
      throw error
   }
}

/**
 * Command line entry point - parses arguments and runs the analysis
 */
async function main() {
   try {
      // Ensure required environment variables are set
      if (!endpoint || !apiKey) {
         console.error(
            'Error: Missing environment variables FORM_RECOGNIZER_ENDPOINT or FORM_RECOGNIZER_API_KEY'
         )
         console.error('Please set these variables in your .env file')
         process.exit(1)
      }

      // Ensure a file path was provided as command line argument
      if (process.argv.length < 3) {
         console.error('Usage: node analyze-document.js <file-path>')
         process.exit(1)
      }

      const filePath = process.argv[2]

      // Verify the file exists
      if (!fs.existsSync(filePath)) {
         console.error(`File not found: ${filePath}`)
         process.exit(1)
      }

      // Check if the file format is supported
      const fileExt = path.extname(filePath).toLowerCase()
      const supportedFormats = [
         '.pdf',
         '.jpg',
         '.jpeg',
         '.png',
         '.bmp',
         '.tiff',
         '.tif'
      ]

      if (!supportedFormats.includes(fileExt)) {
         console.error(`Unsupported file type: ${fileExt}`)
         console.error(`Supported types: ${supportedFormats.join(', ')}`)
         process.exit(1)
      }

      // Run the document analysis
      await analyzeInvoice(filePath)
   } catch (error) {
      console.error('An error occurred:', error)
      process.exit(1)
   }
}

// Execute the script
main()
