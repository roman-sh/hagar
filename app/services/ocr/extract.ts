// @ts-nocheck
/**
 * Extracts key information from Azure Document Intelligence analysis JSON
 * @param {Object} analysisResult - The analysis result from Azure Document Intelligence
 * @returns {Object} - Extracted information in a simplified format
 */
function extractInvoiceData(analysisResult) {
   // Text cleanup function
   const cleanText = (text) => {
      if (!text) return ''
      return text
         .replace(/\n/g, ' ') // Replace newlines with spaces
         .replace(/:selected:/g, '') // Remove :selected: tags
         .replace(/:unselected:/g, '') // Remove :unselected: tags
         .replace(/\s+/g, ' ') // Reduce multiple spaces to single space
         .replace(/"/g, '״') // Replace double quotes with gershaim
         .trim() // Remove leading/trailing spaces
   }

   // Direct date formatter without type checking
   const formatDate = (dateValue) => {
      return new Date(dateValue).toISOString().split('T')[0]
   }

   // Extract basic invoice information
   const extractedData = {
      invoiceId: analysisResult.documents[0].fields.InvoiceId.value,
      vendorName: cleanText(
         analysisResult.documents[0].fields.VendorName.value
      ),
      invoiceDate: formatDate(
         analysisResult.documents[0].fields.InvoiceDate.value
      ),
      items: []
   }

   // Extract items from the first table
   const table = analysisResult.tables[0]
   const columnCount = table.columnCount

   // Use a single row array and make copies when adding to items
   const row = []
   table.cells.forEach((cell, index) => {
      // Clean the cell content before adding it to the row
      row.push(cleanText(cell.content))

      // When we reach the end of a row, add a copy to items and reset
      if ((index + 1) % columnCount === 0) {
         extractedData.items.push([...row]) // Push a copy of the row
         row.length = 0 // Clear the row for reuse
      }
   })

   return extractedData
}

// Example usage:
// const analysisResult = require('./10032025_analysis.json');
// const extractedData = extractInvoiceData(analysisResult);
// console.log(JSON.stringify(extractedData, null, 2));

module.exports = { extractInvoiceData }
