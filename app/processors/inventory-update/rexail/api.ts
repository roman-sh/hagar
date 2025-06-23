import axios from 'axios'
import { getAuthToken } from './auth'
import { getStoreToken } from './token'

const AUTH_ERROR_STATUSES = [401, 403]

/**
 * Checks if a given error from Axios is an authentication-related error.
 * @param error The error object from the Axios interceptor.
 * @returns {boolean} True if the error has a status code of 401 or 403.
 */
function isAuthError(error: any): boolean {
  return AUTH_ERROR_STATUSES.includes(error.response?.status)
}

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
      // The `error.config` object contains the original configuration of the
      // request that failed. We use it as a blueprint to retry the request.
      const originalRequest = error.config

      // Check for the specific auth error case to attempt recovery.
      if (isAuthError(error) && !originalRequest._retry) {
         // The _retry property is a custom flag we add to the request config
         // to prevent an infinite loop. If the token refresh fails and we get
         // another auth error, this flag will prevent us from retrying again.
         originalRequest._retry = true

         try {
            // Log the recovery attempt specifically.
            log.warn('Authentication error detected. Starting token refresh process...')
            const newToken = await getAuthToken(originalRequest.storeId)

            // Update the header in the original request with the new token
            originalRequest.headers['Tarfash'] = newToken
            log.info({ storeId: originalRequest.storeId }, 'Token refreshed successfully. Retrying original request...')

            // Retry the original request
            return rexailApi(originalRequest)
         } catch (refreshError) {
            log.error(refreshError, 'Failed to refresh auth token.')
            return Promise.reject(refreshError)
         }
      }

      // For all other errors that we don't handle, just reject the promise
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