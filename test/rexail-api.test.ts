import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { buildApp } from '../app/main'
import rexailApi from '../app/processors/inventory-update/rexail/api'
import { updateStoreToken } from '../app/processors/inventory-update/rexail/token'

describe('Rexail API Interceptor', () => {
   let app: Hono

   beforeAll(async () => {
      // Build the app once for all tests in this suite
      const built = await buildApp()
      app = built.app

      // Add a temporary test route to the app instance for this test
      app.get('/test/interceptor', async (c) => {
         const TEST_STORE_ID = 'organi_ein_karem'
         try {
            await updateStoreToken(TEST_STORE_ID, 'invalid-token-for-test')
            const { data } = await rexailApi.get('store/get', {
               storeId: TEST_STORE_ID,
            })
            return c.json({ success: true, data })
         } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return c.json({ success: false, error: errorMessage }, 500)
         }
      })
   })

   it('should automatically refresh an expired token and retry the request', async () => {
      // This request will trigger the entire interceptor flow.
      // We are only interested in the final status code.
      const res = await app.request('/test/interceptor')

      // Assert that the final response status is 200 OK.
      // This proves the interceptor caught the initial 403,
      // refreshed the token, and successfully retried the request.
      expect(res.status).toBe(200)
   })
}) 