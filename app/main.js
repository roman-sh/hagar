import './utils/suppress-warnings.js'
import './utils/global-logger.js'
import db from './db/connection.js'


const main = async () => {
    const users = db.collection('users')
    
    const result = await users.findOne({
        _id: 'custom-id-1',
    })
    log.info({ result }, 'Mongo Query Test')
}


try {
    await main()
} catch (error) {
    log.error(error, 'Fatal error')
}