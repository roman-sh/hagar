import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3.js'
import { db } from '../connections/mongodb.ts'
import { Context } from 'hono'
import { Collection } from 'mongodb'
import { ScanDocument } from '../types/documents'
import { DocType } from '../config/constants.ts'

export const pdfUploadHandler = async (c: Context) => {
   // Parse the multipart form data with Hono's built-in types
   const body = await c.req.parseBody()
   
   // Get the file from the parsed body using Web standard File type
   const file = body.pdf as File
   
   // Get the file details
   const fileBuffer = await file.arrayBuffer()
   const originalFilename = file.name
   const contentType = file.type
   
   // Get store ID from query params and ensure it exists
   const storeId = c.req.query('storeId')!
   
   const s3Key = `${storeId}/${originalFilename}`
   
   // Upload to S3
   const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: new Uint8Array(fileBuffer),  // Convert ArrayBuffer to Uint8Array for S3
      ContentType: contentType
   })
   
   await s3Client.send(uploadCommand)
   
   // Create MongoDB document
   const doc: ScanDocument = {
      _id: `${DocType.SCAN}_${originalFilename}`,
      type: DocType.SCAN,
      storeId,
      filename: originalFilename,
      createdAt: new Date(),
      contentType: contentType,
      url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      s3Key
   }
   
   // Get the collection with proper typing
   const collection: Collection<ScanDocument> = db.collection(storeId)
   
   // Insert document into MongoDB
   const { insertedId } = await collection.insertOne(doc)
   
   return c.json({
      message: 'PDF uploaded successfully',
      docId: doc._id,
      url: doc.url
   }, 201)
} 