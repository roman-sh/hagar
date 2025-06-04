import 'dotenv/config'
import { MongoClient } from 'mongodb'
import { exec } from 'child_process'

// Initialize MongoDB client
const mongoClient = new MongoClient(process.env.MONGO_URI)
await mongoClient.connect()
const db = mongoClient.db(process.env.MONGO_DB_NAME, { ignoreUndefined: true })

// Clear MongoDB collections
await db.collection('messages').deleteMany({})
await db.collection('scans').deleteMany({})

// Clear Bull queues from Redis
exec('redis-cli --scan --pattern "bull:*" | xargs redis-cli DEL')

// Close MongoDB connection
await mongoClient.close()

console.log('done') 