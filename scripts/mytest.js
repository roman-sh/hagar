import 'dotenv/config'
import { MongoClient } from 'mongodb'


// Initialize MongoDB client
const mongoClient = new MongoClient(process.env.MONGO_URI)
await mongoClient.connect()
const db = mongoClient.db(process.env.MONGO_DB_NAME, { ignoreUndefined: true })

await db.collection('test').insertOne({
   name:    'test1',
   value:   undefined,
   null:    null,
})

console.log('done')