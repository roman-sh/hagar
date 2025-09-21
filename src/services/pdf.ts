import sharp from 'sharp'
import { pdf as pdfToImg } from 'pdf-to-img'
import { PDFDocument } from 'pdf-lib'


export const pdf = {
   resize,
   cropToTopHalf,
}


/**
 * Resizes a PDF buffer by converting pages to images, resizing them,
 * and reconstructing a new PDF.
 * @param pdfBuffer The high-resolution PDF buffer.
 * @returns A new, low-resolution PDF buffer.
 */
async function resize(pdfBuffer: Buffer): Promise<Buffer> {
   // Phase 1: Deconstruct (PDF -> High-Res Image Buffers)
   // The pdfToImg library handles the complexity of PDF parsing.
   // We use a higher scale to ensure good quality for the initial render.
   const document = await pdfToImg(pdfBuffer, { scale: 3 })
   const resizedImageBuffers: Buffer[] = []

   // Phase 2: Resize (Process Images)
   // The 'document' is an async iterable, yielding a buffer for each page.
   for await (const page of document) {
      const lowResImageBuffer = await sharp(page)
         .resize({
            width: 2048,
            height: 2048,
            fit: 'inside',
            withoutEnlargement: true,
         })
         .jpeg({ quality: 80 })
         .toBuffer()
      resizedImageBuffers.push(lowResImageBuffer)
   }

   // Phase 3: Reconstruct (Images -> PDF)
   const newPdfDoc = await PDFDocument.create()
   for (const imageBuffer of resizedImageBuffers) {
      const image = await newPdfDoc.embedJpg(imageBuffer)
      // A4 page size in PostScript points
      const page = newPdfDoc.addPage([595, 842])
      page.drawImage(image, {
         x: 0,
         y: 0,
         width: page.getWidth(),
         height: page.getHeight(),
      })
   }

   const newPdfBuffer = await newPdfDoc.save()
   return Buffer.from(newPdfBuffer)
}


/**
 * Creates a new PDF containing only the top half of each page from an original PDF buffer.
 * @param pdfBuffer The original PDF buffer.
 * @returns A new PDF buffer containing the cropped pages.
 */
async function cropToTopHalf(pdfBuffer: Buffer): Promise<Buffer> {
   // Phase 1: Deconstruct (PDF -> High-Res Image Buffers)
   const document = await pdfToImg(pdfBuffer, { scale: 3 })
   const croppedImageBuffers: Buffer[] = []

   // Phase 2: Crop (Process Images)
   for await (const page of document) {
      const image = sharp(page)
      const metadata = await image.metadata()

      if (metadata.height) {
         const croppedImageBuffer = await image
            .extract({
               left: 0,
               top: 0,
               width: metadata.width,
               height: Math.floor(metadata.height / 2),
            })
            .jpeg({ quality: 80 })
            .toBuffer()
         croppedImageBuffers.push(croppedImageBuffer)
      }
   }

   // Phase 3: Reconstruct (Images -> PDF)
   const newPdfDoc = await PDFDocument.create()
   for (const imageBuffer of croppedImageBuffers) {
      const image = await newPdfDoc.embedJpg(imageBuffer)
      // We create a new page with an aspect ratio that matches the cropped image.
      const page = newPdfDoc.addPage([image.width, image.height])
      page.drawImage(image, {
         x: 0,
         y: 0,
         width: page.getWidth(),
         height: page.getHeight(),
      })
   }

   const newPdfBuffer = await newPdfDoc.save()
   return Buffer.from(newPdfBuffer)
} 