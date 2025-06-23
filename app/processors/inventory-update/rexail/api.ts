import axios from 'axios'
import { getAuthToken } from './auth'
import { getStoreToken } from './token'

// Create a dedicated axios instance for Rexail API calls
const rexailApi = axios.create({
   baseURL: 'https://il.rexail.com/retailer/back-office/back-office/',
})

// Request Interceptor: Injects the auth token into every request
rexailApi.interceptors.request.use(
   async (config) => {
      // We need to pass storeId in the config to know which token to use
      if (!config.storeId) {
         throw new Error('storeId must be provided in the axios config')
      }
      const token = await getStoreToken(config.storeId)
      if (token) {
         config.headers['Tarfash'] = token
      }
      return config
   },
   (error) => {
      return Promise.reject(error)
   }
)

// Response Interceptor: Handles expired tokens and retries the request
rexailApi.interceptors.response.use(
   (response) => response, // Return successful responses
   async (error) => {
      const originalRequest = error.config
      // Check for auth error and ensure we haven't already retried
      if ((error.response.status === 401 || error.response.status === 403) && !originalRequest._retry) {
         originalRequest._retry = true // Mark as retried

         try {
            log.info({ storeId: originalRequest.storeId }, 'Auth token expired or invalid. Refreshing...')
            const newToken = await getAuthToken(originalRequest.storeId)

            // Update the header in the original request with the new token
            originalRequest.headers['Tarfash'] = newToken
            log.info({ storeId: originalRequest.storeId }, 'Token refreshed successfully. Retrying original request...')

            // Retry the original request
            return rexailApi(originalRequest)
         } catch (refreshError) {
            log.error({ storeId: originalRequest.storeId, err: refreshError }, 'Failed to refresh auth token.')
            return Promise.reject(refreshError)
         }
      }

      // For all other errors, just reject the promise
      return Promise.reject(error)
   }
)

// Add a declaration to allow custom properties on the AxiosRequestConfig
declare module 'axios' {
   export interface AxiosRequestConfig {
      storeId?: string;
   }
}

export default rexailApi 