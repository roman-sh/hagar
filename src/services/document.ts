import { PutObjectCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../connections/s3'
import { db } from '../connections/mongodb'
import { Collection } from 'mongodb'
import { ScanDocument, DocType } from '../types/documents'
import { openai } from '../connections/openai'
import { createHmac } from 'crypto'
import { pdf } from './pdf'
import { toFile } from 'openai/uploads'


type OnboardArgs = Pick<
   ScanDocument,
   'filename' | 'contentType' | 'storeId' | 'userName' | 'phone'
> & {
   fileBuffer: Buffer
}

export const document = {
   onboard: async (args: OnboardArgs) => {
      const { fileBuffer, filename, contentType, storeId, userName, phone } = args

      if (!process.env.ENCRYPTION_KEY) throw new Error(
         'ENCRYPTION_KEY must be set in environment variables for secure filename generation.'
      )
      
      // Sanitize filename
      const sanitizedFilename = filename.replace(/\s+/g, '_')

      // Create a consistent, secure prefix
      const prefix = createHmac('sha256', process.env.ENCRYPTION_KEY)
         .update(sanitizedFilename)
         .digest('base64url')
         .substring(0, 6)

      // Create the S3 key with the prefix
      const s3Key = `${storeId}/${prefix}-${sanitizedFilename}`

      // Upload to S3
      const uploadCommand = new PutObjectCommand({
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: s3Key,
         Body: fileBuffer,
         ContentType: contentType,
         IfNoneMatch: '*'  // will throw an error if the file already exists
      })

      await s3Client.send(uploadCommand)
      log.info({ s3Key }, 'File uploaded to S3')

      // Crop the PDF to its top half for validation purposes.
      const croppedPdfBuffer = await pdf.cropToTopHalf(fileBuffer)
      log.info({ s3Key }, 'Cropped PDF to top half for validation')

      // Upload to OpenAI Files API using the 'toFile' utility for robust type conversion.
      const file = await toFile(croppedPdfBuffer, sanitizedFilename, { type: contentType })
      const openaiFile = await openai.files.create({
         file,
         purpose: 'user_data'
      })
      log.info(
         { file: openaiFile.filename, fileId: openaiFile.id },
         'File uploaded to openai'
      )

      // Create MongoDB document
      const doc: ScanDocument = {
         _id: `${DocType.SCAN}:${storeId}:${sanitizedFilename}`,
         type: DocType.SCAN,
         storeId,
         fileId: openaiFile.id,
         filename: sanitizedFilename,
         contentType: contentType,
         url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`,
         userName,
         phone,
         createdAt: new Date()
      }

      // Insert document into MongoDB
      const collection: Collection<ScanDocument> = db.collection('scans')
      const { insertedId } = await collection.insertOne(doc)
      log.info({ docId: insertedId }, 'Document inserted into MongoDB')

      return {
         docId: doc._id,
         url: doc.url
      }
   }
} 