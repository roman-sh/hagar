import { ChatCompletionTool } from 'openai/resources'
import { db } from '../connections/mongodb'
import { H } from '../config/constants'
import { findActiveJob } from '../services/pipeline'
import { InventoryDocument } from '../types/inventory'
import { ProductDocument } from '../types/documents'
import {
   ProductNotFoundError,
   ItemNotFoundError,
} from '../errors/application-errors'

export const applyRowCorrectionSchema: ChatCompletionTool = {
   type: 'function',
   function: {
      name: 'applyRowCorrection',
      description:
         'Applies a confirmed correction to a specific row in an inventory draft.',
      parameters: {
         type: 'object',
         properties: {
            docId: {
               type: 'string',
               description:
                  'The ID of the document/job being processed, taken from the Markdown context.',
            },
            row_number: {
               type: 'string',
               description: 'The row number (#) of the item to be corrected.',
            },
            inventory_item_id: {
               type: 'string',
               description:
                  'The internal database _id of the product that the user has confirmed is the correct match.',
            },
         },
         required: ['docId', 'row_number', 'inventory_item_id'],
      },
   },
}

export async function applyRowCorrection(args: {
   docId: string
   row_number: string
   inventory_item_id: string
}): Promise<{ success: boolean; message: string }> {
   const { docId, row_number, inventory_item_id } = args

   try {
      // 1. Find the active job
      const { job } = await findActiveJob(docId)
      const doc = job.data as InventoryDocument

      // 2. Fetch the new product details from the database for data integrity
      const product = await db
         .collection<ProductDocument>('products')
         .findOne({ _id: inventory_item_id })

      if (!product) {
         throw new ProductNotFoundError(
            `Product with ID ${inventory_item_id} not found.`
         )
      }

      // 3. Find the item to update in the document
      const itemToUpdate = doc.items.find(
         item => item[H.ROW_NUMBER] === row_number
      )

      if (!itemToUpdate) {
         throw new ItemNotFoundError(
            `Item with row number ${row_number} not found in the document.`
         )
      }

      // 4. Mutate the item with the new, verified data
      itemToUpdate[H.INVENTORY_ITEM_ID] = product._id
      itemToUpdate[H.INVENTORY_ITEM_NAME] = product.name
      itemToUpdate[H.INVENTORY_ITEM_UNIT] = product.unit
      itemToUpdate[H.MATCH_TYPE] = 'manual'
      delete itemToUpdate.candidates // Clean up previous candidates

      // 5. Save the updated document back to the job
      await job.update(doc)

      const message = `Successfully updated row ${row_number} to "${product.name}".`
      log.info({ docId, row_number, newProductId: product._id }, message)
      
      return { success: true, message }
   }
   catch (error) {
      let errorMessage: string

      switch (true) {
         case error instanceof ProductNotFoundError:
         case error instanceof ItemNotFoundError:
            // For our known, "safe" business errors, we can use the specific message.
            errorMessage = (error as Error).message
            break
         default:
            // For all other unexpected errors, create a generic message.
            errorMessage = `Failed to apply correction for row ${row_number}. An unexpected error occurred.`
      }

      // Log the full error object with the final, determined message for context.
      log.error(error, `Apply correction failed for docId ${docId}: ${errorMessage}`)
      
      return { success: false, message: errorMessage }
   }
} 