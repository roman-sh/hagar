import { MongoClient, Db } from 'mongodb'

// MongoDB client and db connection with proper typing
export let db: Db

export async function initializeDatabase(): Promise<Db> {
   // Get MongoDB connection URI from environment variables
   const uri = process.env.MONGO_URI
   if (!uri) throw new Error(
      'MONGO_URI is not defined in the environment variables.'
   )

   // Create a MongoClient with a MongoClientOptions object to set the Stable API version
   const client = new MongoClient(uri)

   // Connect the client to the server
   await client.connect()

   const dbName = process.env.MONGO_DB_NAME
   if (!dbName) throw new Error(
      'MONGO_DB_NAME is not defined in the environment variables.'
   )

   // Get a reference to the database
   db = client.db(dbName, { ignoreUndefined: true })

   // Verify the connection with a simple command
   await db.command({ ping: 1 })
   log.info(`Connected to MongoDB database: ${dbName}`)

   return db
}
