import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3.js'
import { db } from '../connections/mongodb.ts'
import { Context } from 'hono'
import { Collection } from 'mongodb'
import { ScanDocument } from '../types/documents'
import { DocType } from '../config/constants.ts'
import { q } from '../helpers/q.ts'


export const pdfUploadHandler = async (c: Context) => {
   // Parse the multipart form data with Hono's built-in types
   const body = await c.req.parseBody()
   
   // Get the file from the parsed body using Web standard File type
   const file = body.file as File
   
   // Get the file details
   const fileBuffer = await file.arrayBuffer()
   const originalFilename = file.name
   const contentType = file.type
   
   // Get store ID from query params and ensure it exists
   const deviceId = c.req.query('deviceId')!
   
   const s3Key = `tmp/${deviceId}/${originalFilename}`
   
   // Upload to S3
   const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: new Uint8Array(fileBuffer),  // Convert ArrayBuffer to Uint8Array for S3
      ContentType: contentType
   })
   
   await s3Client.send(uploadCommand)

   // TODO: get storeId from db
   const storeId = 'organi_ein_karem'
   
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

   // Queue the document to the next queue in the pipeline
   q(storeId, insertedId, null) 
   // null because it's the first queue (no current queue)
   // we on purpose do not await this because it's not a blocker for the response
   
   return c.json({
      message: 'PDF uploaded successfully',
      docId: doc._id,
      url: doc.url
   }, 201)
} 