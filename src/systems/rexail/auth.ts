import { StoreDocument } from '../../types/documents'
import { cryptoService } from '../../services/crypto'
import puppeteer from 'puppeteer'
import { db } from '../../connections/mongodb'
import { updateStoreToken } from './token'


/**
 * Uses Puppeteer to log in to the back-office and retrieve a new authentication token.
 *
 * This function should be called when an API call fails due to an invalid or expired token.
 * It performs a fresh login and saves the new token to the database and cache.
 *
 * @param {string} storeId - The ID of the store to get a token for.
 * @returns {Promise<string>} A promise that resolves to a new, valid auth token.
 */
export async function getAuthToken(storeId: string): Promise<string> {
   const store = await db.collection<StoreDocument>('stores').findOne({ storeId })

   if (!store) throw new Error(`Store not found for storeId: ${storeId}`)

   log.info({ storeId }, 'Launching Puppeteer to authenticate and fetch a new token.')

   const password = cryptoService.decrypt(store.backoffice.password)

   const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
   const context = await browser.createIncognitoBrowserContext()
   const page = await context.newPage()
   let token: string | null = null

   try {
      // Set up a listener that will catch the subsequent API call
      page.on('request', (request) => {
         const headers = request.headers()
         if (headers['tarfash']) {
            token = headers['tarfash']
            // This is a fallback, the primary method is parsing the page content
         }
      })

      // Navigate to the login page
      await page.goto(store.backoffice.url, { waitUntil: 'networkidle2' })

      // Use a more robust, human-like interaction
      await page.click('input[name="username"]')
      await page.keyboard.type(store.backoffice.username)
      
      await page.click('input[name="password"]')
      await page.keyboard.type(password)
      
      // Click login and wait for the navigation to the dashboard
      await Promise.all([
         page.click('button[type="submit"]'),
         page.waitForNavigation({ waitUntil: 'networkidle2' }),
      ])

      // Get the full HTML content of the page after login
      const pageContent = await page.content()

      // Use a regex to find the tarfash token in the script tag
      const tokenMatch = pageContent.match(/const tarfash = "([^"]+)"/)
      if (tokenMatch && tokenMatch[1]) {
         token = tokenMatch[1]
      }

      if (!token) {
         throw new Error('Login failed: could not find auth token in the page content after login.')
      }

      log.info({ storeId }, 'Successfully extracted auth token from page content')

      // 4. Save the new token to the database and cache
      await updateStoreToken(storeId, token)
      log.debug({ storeId }, 'Successfully saved new auth token')

      return token

   } catch (error) {
      log.error({ storeId, err: error }, 'Error during Puppeteer authentication')
      // Consider taking a screenshot for debugging
      await page.screenshot({ path: `logs/error-screenshot-${storeId}-${Date.now()}.png` })
      throw error // Re-throw the error to be handled by the caller
   } finally {
      await browser.close()
   }
} 