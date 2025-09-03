"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var mongodb_1 = require("mongodb");
var child_process_1 = require("child_process");
// Initialize MongoDB client
var mongoClient = new mongodb_1.MongoClient(process.env.MONGO_URI);
await mongoClient.connect();
var db = mongoClient.db(process.env.MONGO_DB_NAME, { ignoreUndefined: true });
// Clear MongoDB collections
await db.collection('messages').deleteMany({});
await db.collection('scans').deleteMany({});
await db.collection('job_artefacts').deleteMany({});
await db.collection('history').deleteMany({});
await db.collection('updates').deleteMany({});
// Clear Bull queues from Redis
(0, child_process_1.exec)('redis-cli --scan --pattern "bull:*" | xargs redis-cli DEL');
// Close MongoDB connection
await mongoClient.close();
console.log('done');
