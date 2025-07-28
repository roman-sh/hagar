import axios from 'axios'


const API_TOKEN = process.env.HEBREWNLP_API_KEY
const API_URL = 'https://hebrew-nlp.co.il/service/morphology/normalize'

/**
 * A wrapper around the hebrew-nlp.co.il API to provide lemmatization.
 * This service acts as an adapter, isolating the external API from the rest of the application.
 * If the external API changes or becomes unreliable, we only need to update this file.
 */
export const lemmatizer = {
   /**
    * Normalizes a batch of texts into arrays of lemmas using a single API call.
    * @param texts An array of strings to lemmatize.
    * @param type The normalization type ('SEARCH' or 'INDEX'). Defaults to 'SEARCH'.
    * @returns A promise that resolves to an array of string arrays, where each inner array contains the lemmas for the corresponding input text.
    */
   async batchLemmatize(
      texts: string[],
      type: 'SEARCH' | 'INDEX' = 'SEARCH'
   ): Promise<string[][]> {

      if (!API_TOKEN) {
         const errorMessage = 'HEBREWNLP_API_KEY is not set'
         log.error(errorMessage)
         throw new Error(errorMessage)
      }

      try {
         // Use the 'sentences' parameter to send multiple texts in one request
         const response = await axios.post<string[][]>(API_URL, {
            token: API_TOKEN,
            sentences: texts,
            type,
         })

         // The API returns an array of sentences (which are arrays of lemmatized words).
         // We apply our definitive cleaning logic to the raw output.
         return response.data.map(sentence =>
            sentence
               .map(token => {
                  // Rule: Lowercase all tokens for case-insensitive matching
                  return token.toLowerCase()
               })
               .filter(token => {
                  // Rule: Remove tokens containing the '#' noise character
                  if (token.includes('#')) {
                     return false
                  }
                  // Rule: Remove tokens that are just numbers
                  if (/^\d+$/.test(token)) {
                     return false
                  }
                  // Rule: Remove single-character tokens (catches punctuation and some stop words)
                  if (token.length <= 1) {
                     return false
                  }

                  return true
               })
         )
      }
      catch (error) {
         const errorMessage = `Lemmatization failed`
         log.error(error, errorMessage)
         throw new Error(errorMessage, { cause: error })
      }
   },
} 