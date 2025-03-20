import 'dotenv/config'
import nano from 'nano'
import { readFile, stat } from 'fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import path from 'path'

const db = nano(process.env.COUCHDB_URL).use(process.env.COUCHDB_DB_NAME)

async function saveBinaryFile(filePath) {
  // Read file content and get stats
  const [content, stats] = await Promise.all([
    readFile(filePath),
    stat(filePath)
  ])

  // Detect mime type
  const fileType = await fileTypeFromBuffer(content)

  // Create document
  const filename = path.basename(filePath)
  const doc = {
    _id: `file_${Date.now()}_${filename}`,
    filename,
    status: 'received',
    createdAt: stats.birthtime.toISOString(),
  }
  
  // First insert the document
  const { id, rev } = await db.insert(doc)
  console.log(`Document created with ID: ${id}`)
  
  // Then attach the binary file
  const response = await db.attachment.insert(
    id, 
    'content', 
    content, 
    fileType.mime, 
    { rev }
  )
  
  console.log('File stored successfully:', response)
  return response
}

// Run the script
const filePath = process.argv[2]
saveBinaryFile(filePath)

