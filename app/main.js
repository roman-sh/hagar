import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import db from './db/connection.js'


const main = async () => {
    try {
        // Test the CouchDB connection with a simple query
        const result = await db.get('custom-id-1', { revs_info: true }).catch(() => null)
        log.info({ result }, 'CouchDB Query Test')
    } catch (error) {
        log.error(error, 'CouchDB query error')
    }
}


try {
    await main()
} catch (error) {
    log.error(error, 'Fatal error')
}