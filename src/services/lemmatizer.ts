import axios from 'axios'

const HEBMORPH_SERVICE_IP = process.env.HEBMORPH_SERVICE_IP
const API_URL = `http://${HEBMORPH_SERVICE_IP}:5001/lemmatize`

interface LemmatizeResponse {
   results: string[][]
}

/**
 * A wrapper around our self-hosted HebMorph lemmatization service.
 * This service acts as an adapter, isolating the external service from the rest of the application.
 */
export const lemmatizer = {
   /**
    * Normalizes a batch of texts into arrays of lemmas using a single API call
    * to the hebmorph-service.
    * @param texts An array of strings to lemmatize.
    * @returns A promise that resolves to an array of string arrays, where each
    *          inner array contains the lemmas for the corresponding input text.
    */
   async batchLemmatize(texts: string[]): Promise<string[][]> {
      if (!HEBMORPH_SERVICE_IP) {
         const errorMessage = 'HEBMORPH_SERVICE_IP is not set'
         log.error(errorMessage)
         throw new Error(errorMessage)
      }

      try {
         const response = await axios.post<LemmatizeResponse>(API_URL, {
            sentences: texts,
         })

         return response.data.results
      } catch (error) {
         const errorMessage = `Lemmatization failed: Could not connect to hebmorph-service at ${API_URL}`
         log.error({ err: error, url: API_URL }, errorMessage)
         throw new Error(errorMessage, { cause: error })
      }
   },
} 