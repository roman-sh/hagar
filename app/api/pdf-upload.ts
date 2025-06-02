import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3.js'
import { db } from '../connections/mongodb'
import { Context } from 'hono'
import { Collection } from 'mongodb'
import { BaseDocument, ScanDocument, StoreDocument } from '../types/documents'
import { DocType } from '../config/constants'
import { q } from '../helpers/q'
import { openai } from '../connections/openai'
import { database } from '../services/db'

export const pdfUploadHandler = async (c: Context) => {
   // Parse the multipart form data with Hono's built-in types
   const body = await c.req.parseBody()

   // Get the file from the parsed body using Web standard File type
   const file = body.file as File

   // Get the file details
   const fileBuffer = await file.arrayBuffer()
   const filename = file.name.replace(/\s+/g, '_')
   const contentType = file.type

   // Get raspberry pi device id from query params
   const deviceId = c.req.query('deviceId')!
   log.info({ deviceId, file: file.name }, 'Received file from device')

   // Sanitize filename for S3 key to avoid spaces in URLs
   const s3Key = `tmp/${deviceId}/${filename}`

   // Upload to S3
   const uploadCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: new Uint8Array(fileBuffer), // Convert ArrayBuffer to Uint8Array for S3
      ContentType: contentType
   })

   await s3Client.send(uploadCommand)
   log.info({ s3Key }, 'File uploaded to S3')

   // Get the storeId for the device
   const { storeId } = await database.getStoreByDevice(deviceId) as unknown as StoreDocument

   // Upload to OpenAI Files API
   const openaiFile = await openai.files.create({
      file,
      purpose: 'user_data'
   })
   log.info(
      { file: openaiFile.filename, fileId: openaiFile.id },
      'File uploaded to openai'
   )
   // openaiFile: {
   //    "object": "file",
   //    "id": "file-KLgKoWqGpaBe3gWcBjqFC8",
   //    "purpose": "user_data",
   //    "filename": "invoice_4.pdf",
   //    "bytes": 437025,
   //    "created_at": 1746999973,
   //    "expires_at": null,
   //    "status": "processed",
   //    "status_details": null
   //  }

   // Create MongoDB document
   const doc: ScanDocument = {
      _id: `${DocType.SCAN}:${storeId}:${filename}`,
      type: DocType.SCAN,
      storeId,
      fileId: openaiFile.id,
      filename: filename,
      contentType: contentType,
      url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
      createdAt: new Date()
   }

   // Insert document into MongoDB
   const collection: Collection<BaseDocument> = db.collection(storeId)
   const { insertedId } = await collection.insertOne(doc)
   log.info({ docId: insertedId }, 'Document inserted into MongoDB')

   // Queue the document to the next queue in the pipeline
   q(storeId, insertedId, null)
   // null because we are queueing to the first queue (no current queue)
   // we on purpose do not await this because it's not a blocker for the response

   return c.json(
      {
         message: 'PDF uploaded successfully',
         docId: doc._id,
         url: doc.url
      },
      201
   )
}
