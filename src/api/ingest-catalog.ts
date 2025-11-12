import { Context } from 'hono'
import { s3Client } from '../connections/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { S3_MANUAL_CATALOG_KEY } from '../config/constants'
import { database } from '../services/db'


export const ingestCatalogHandler = async (c: Context) => {
   try {
      const body = await c.req.json()
      const { storeName, catalog: catalogResponse } = body

      if (!storeName || !catalogResponse) {
         return c.json({ success: false, message: 'Missing storeName or catalog data' }, 400)
      }
      
      log.info({ storeName }, 'Received catalog data from Chrome extension.')
      
      const store = await database.getStoreByName(storeName)

      if (!store) {
         log.warn({ storeName }, 'Received catalog for an unknown store name.')
         return c.json({ success: false, message: 'Store not found' }, 404)
      }

      const storeId = store.storeId
      const s3Key = S3_MANUAL_CATALOG_KEY.replace('{{storeId}}', storeId)

      const uploadCommand = new PutObjectCommand({
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: s3Key,
         Body: JSON.stringify(catalogResponse),
         ContentType: 'application/json',
      })

      await s3Client.send(uploadCommand)

      log.info({ storeId, s3Key }, 'Successfully saved manual catalog to S3.')

      return c.json({
         status: 'success',
         message: `Catalog for store ${storeId} saved to S3.`,
      })

   } catch (error) {
      log.error(error, 'Error in ingest-catalog handler.')
      return c.json({ status: 'error', message: 'Internal server error.' }, 500)
   }
}
