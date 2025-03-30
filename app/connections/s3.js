import 'dotenv/config'
import { S3Client, GetBucketPolicyCommand } from '@aws-sdk/client-s3'

// S3 client instance
export let s3Client

export async function initializeS3() {
   s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
         accessKeyId: process.env.AWS_ACCESS_KEY,
         secretAccessKey: process.env.AWS_SECRET_KEY
      }
   })

   // verify the connection
   await s3Client.send(
      new GetBucketPolicyCommand({
         Bucket: process.env.AWS_BUCKET_NAME,
      })
   )

   log.info('S3 client initialized')
   return s3Client
}

// export default s3Client