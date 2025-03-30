import multer from 'multer'
import { randomBytes } from 'crypto'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3.js'
import { db } from '../connections/mongodb.js'


// 'pdf' is the field name expected in the form data
const upload = multer().single('pdf')

export const pdfUploadHandler = async (req, res, next) => {
   // Use multer to process the uploaded file
   upload(req, res, async (err) => {
      // Handle multer-specific errors
      if (err) {
         console.error('Multer error:', err)
         return res.status(400).json({ error: err.message })
      }
      // Check if file exists
      if (!req.file) {
         return res.status(400).json({ error: 'No file uploaded' })
      }
      try {
         const fileBuffer = req.file.buffer
         const originalFilename = req.file.originalname
         const contentType = req.file.mimetype

         // Get store ID from query params or use default
         const storeId = req.query.storeId

         // Generate unique filename for S3
         // const pathObfuscator = randomBytes(24).toString('base64url')
         // const s3Key = `${storeId}/${pathObfuscator}/${originalFilename}`
         const s3Key = `${storeId}/${originalFilename}`

         // Upload to S3
         const uploadCommand = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: contentType
         })

         await s3Client.send(uploadCommand)

         // Create MongoDB document
         const doc = {
            _id: `scan_${originalFilename}`,
            type: 'scan',
            storeId,
            filename: originalFilename,
            createdAt: new Date(),
            contentType: contentType,
            url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
            s3Key
         }

         // Insert document into MongoDB
         const { insertedId } = await db.collection(storeId).insertOne(doc)

         // Return success response
         res.status(201).json({
            message: 'PDF uploaded successfully',
            docId: insertedId,
            url: doc.url
         })

         // Add the document to the scan processing queue
         const { pipeline } = await db.collection(storeId).findOne(
            { _id: `store_${storeId}` },
            { projection: { pipeline: 1 } }
         )
      } catch (error) {
         // Minimal catch that just forwards to Express error handler
         next(error)
      }
   })
}