import { Context } from 'hono'
import { database } from '../services/db'
import { document } from '../services/document'

export const pdfUploadHandler = async (c: Context) => {
   // Parse the multipart form data
   const body = await c.req.parseBody()
   const file = body.file as File

   // Get file details
   const fileBuffer = await file.arrayBuffer()
   const filename = file.name
   const contentType = file.type

   // Get device and store details
   const deviceId = c.req.query('deviceId')
   const { storeId } = await database.getStoreByDevice(deviceId)

   // Onboard the document using the new service
   const result = await document.onboard({
      fileBuffer: Buffer.from(fileBuffer),
      filename,
      contentType,
      storeId,
      channel: 'scanner',
      author: 'scanner'
   })

   log.info({ deviceId, file: filename, docId: result.docId }, 'File from device onboarded')

   return c.json(
      {
         message: 'PDF uploaded successfully',
         docId: result.docId,
         url: result.url
      },
      201
   )
}
