import { db } from '../connections/mongodb.js'
import { queuesMap } from '../queues.js'

export const q = async (storeId, docId, currentQ) => {
   const { pipeline } = await db.collection(storeId).findOne(
      { type: 'store' },
      { projection: { pipeline: 1 }}
   )
   
   const idx = pipeline.findIndex(q => q === currentQ)
   const nextQ = pipeline[idx + 1]
   
   await queuesMap[nextQ].add(
      nextQ,
      {   
         scanId: docId,
         storeId
      },
      {
         jobId: docId
      }
   )
   
   console.log(`Document ${docId} queued to ${nextQ}`)
}
