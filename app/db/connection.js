import { MongoClient, ServerApiVersion } from 'mongodb'
import 'dotenv/config'

// MongoDB client and db connection
let client
let db

export async function initializeDatabase() {
   // Get MongoDB connection URI from environment variables
   const uri = process.env.MONGO_URI

   // Create a MongoClient with a MongoClientOptions object to set the Stable API version
   client = new MongoClient(uri, {
      serverApi: {
         version: ServerApiVersion.v1,
         strict: true,
         deprecationErrors: true
      }
   })

   // Connect the client to the server
   await client.connect()

   const dbName = process.env.MONGO_DB_NAME

   // Get a reference to the database
   db = client.db(dbName)

   // Verify the connection with a simple command
   await db.command({ ping: 1 })
   log.info(`Connected to MongoDB database: ${dbName}`)

   return db
}

// Export the db object (it will be null until initializeDatabase is called)
export default db
