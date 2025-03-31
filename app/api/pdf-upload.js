import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3.js'
import { db } from '../connections/mongodb.js'

export const pdfUploadHandler = async (c) => {
   // Parse the multipart form data
   const body = await c.req.parseBody()
   
   // Get the file from the parsed body
   const file = body.pdf
   
   // Get the file details
   const fileBuffer = await file.arrayBuffer()
   const originalFilename = file.name
   const contentType = file.type
   
   // Get store ID from query params
   const storeId = c.req.query('storeId')
   
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
   
   return c.json({
      message: 'PDF uploaded successfully',
      docId: doc._id,
      url: doc.url
   }, 201)
}


