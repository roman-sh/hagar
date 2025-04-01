import 'dotenv/config'
import { S3Client, GetBucketPolicyCommand } from '@aws-sdk/client-s3'

// S3 client instance
export let s3Client: S3Client;

export async function initializeS3(): Promise<S3Client> {
   s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
         accessKeyId: process.env.AWS_ACCESS_KEY || '',
         secretAccessKey: process.env.AWS_SECRET_KEY || ''
      }
   })

   // verify the connection
   try {
      await s3Client.send(
         new GetBucketPolicyCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
         })
      )
      log.info('S3 client initialized')
   } catch (error) {
      // If there's no bucket policy, it's still a valid connection
      // AWS returns a NoSuchBucketPolicy error which is expected
      log.info('S3 client initialized (no bucket policy found)')
   }

   return s3Client
} 