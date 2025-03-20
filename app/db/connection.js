import nano from 'nano'
import 'dotenv/config'
import log from '../utils/global-logger.js'

let db

async function initializeDatabase() {
    try {
        // Connect to the CouchDB server
        const couch = nano(process.env.COUCHDB_URL)
        
        // Get database name from env or use default
        const dbName = process.env.COUCHDB_DB_NAME || 'rexail'
        
        try {
            // Try to use the database directly
            db = couch.use(dbName)
            
            // Verify connection by making a simple request
            await db.info()
            log.info(`Connected to CouchDB database: ${dbName}`)
        } catch (error) {
            // If database doesn't exist, create it
            await couch.db.create(dbName)
            db = couch.use(dbName)
            log.info(`Created and connected to CouchDB database: ${dbName}`)
        }
    } catch (error) {
        log.error(error, 'CouchDB connection error')
        throw error
    }
}

// Initialize the database connection
await initializeDatabase()

export default db