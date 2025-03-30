import 'dotenv/config'
import path from 'path'
import { randomBytes } from 'crypto'
import { MongoClient } from 'mongodb'
import { readFile, stat } from 'fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// Initialize MongoDB client
const mongoClient = new MongoClient(process.env.MONGO_URI)
await mongoClient.connect()
const db = mongoClient.db(process.env.MONGO_DB_NAME)

// Initialize S3 client
const s3Client = new S3Client({
   region: process.env.AWS_REGION,
   credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY,
      secretAccessKey: process.env.AWS_SECRET_KEY
   }
})

async function saveBinaryFile(filePath, storeId = 'organi_ein_karem') {
   try {
      // Read file content and get stats
      const [content, stats] = await Promise.all([
         readFile(filePath),
         stat(filePath)
      ])

      // Detect mime type
      const fileType = await fileTypeFromBuffer(content)

      // Generate unique filename for S3
      const filename = path.basename(filePath)
      const randomId = randomBytes(24).toString('base64url')
      const s3Key = `${storeId}/${randomId}/${filename}`

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: s3Key,
         Body: content,
         ContentType: fileType.mime
      })

      await s3Client.send(uploadCommand)

      // Create MongoDB document
      const doc = {
         _id: `scan_${filename}`,
         storeId,
         filename,
         status: 'received',
         createdAt: stats.birthtime.toISOString(),
         contentType: fileType.mime,
         url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
         s3Key
      }

      // Insert document into MongoDB
      const result = await db.collection(storeId).insertOne(doc)

      console.log(`Document created with ID: ${result.insertedId}`)
      console.log('File stored successfully in S3:', doc.url)

      return doc
   } finally {
      // Close MongoDB connection
      await mongoClient.close()
   }
}

// Run the script
const filePath = process.argv[2]
saveBinaryFile(filePath).catch((error) => {
   console.error('Error:', error)
   process.exit(1)
})
