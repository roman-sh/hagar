// This script is injected into the backoffice page when you click the extension button.

/**
 * Helper function to send log messages back to the popup UI and also log to the dev console.
 * @param {string} message The message to log.
 */
function log(message) {
   console.log(message)
   chrome.runtime.sendMessage({ type: 'LOG', message: message })
}

(async () => {
   log('Content script loaded.')

   // --- Step 1: Get the Auth Token using a script injection trick ---
   // Content scripts run in an "isolated world" and cannot directly access page-level
   // JavaScript variables (like `tarfash`). To get around this, we inject a separate
   // script (`injector.js`) into the main page's context. That script can access
   // the variable and then securely pass it back to us using `postMessage`.
   function getTokenFromPage() {
      return new Promise((resolve, reject) => {
         // Listener for the message from the injected script
         const handleMessage = (event) => {
            if (event.source === window && event.data.type === 'FROM_PAGE_SCRIPT') {
               window.removeEventListener('message', handleMessage)
               if (event.data.error) {
                  reject(new Error(event.data.error))
               } else {
                  resolve(event.data.token)
               }
            }
         }
         window.addEventListener('message', handleMessage, false)

         // Create and inject the script tag to bridge the isolated worlds
         const script = document.createElement('script')
         script.src = chrome.runtime.getURL('injector.js')
         document.body.appendChild(script)
         document.body.removeChild(script) // Clean up the script tag from the DOM
      })
   }

   log('Attempting to extract token from page...')
   const token = await getTokenFromPage()

   if (!token) {
      const errorMsg =
         "Authentication token not found. The 'tarfash' variable may not be available on the page. Make sure you are logged in."
      log(`ERROR: ${errorMsg}`)
      return
   }
   log('Successfully extracted token.')

   // --- Step 2: Extract the Store Name from the DOM ---
   // We look for the store name in two possible locations to make the script
   // more resilient to minor HTML changes in the backoffice UI.
   let storeName = null
   const primarySelector = document.querySelector('div.user-block .detail strong') // Main user block

   if (primarySelector) {
      storeName = primarySelector.textContent.trim()
   } else {
      log('Primary store name selector failed, trying fallback selector...')
      // Fallback to the dropdown profile link in the header
      const fallbackSelector = document.querySelector('li.profile.dropdown a.dropdown-toggle strong')
      if (fallbackSelector) {
         storeName = fallbackSelector.textContent.trim()
      }
   }

   if (!storeName) {
      log('ERROR: Could not find store name on the page using primary or fallback selectors. The HTML structure may have changed.')
      return
   }
   log(`Found store name: ${storeName}`)


   // The API endpoint we discovered from the backend source code.
   const API_ENDPOINT =
      'https://il.rexail.com/retailer/back-office/back-office/catalog/obfuscated/get?inheritFromMaster=false'

   // --- Step 3: Fetch the Catalog Data ---
   try {
      log(`Fetching catalog from ${API_ENDPOINT}...`)

      const response = await fetch(API_ENDPOINT, {
         headers: {
            // We manually add the extracted token to the custom 'Tarfash' header.
            Tarfash: token,
         },
      })

      if (!response.ok) {
         const errorBody = await response
            .text()
            .catch(() => 'Could not read response body.')
         throw new Error(
            `Network response was not ok. Status: ${response.status} (${response.statusText
            }). Body: ${errorBody.substring(0, 200)}`
         )
      }

      const catalogResponse = await response.json()

      if (!catalogResponse?.data) {
         log('ERROR: Fetched data is not in the expected format (missing .data property).')
         return
      }

      log(`Successfully fetched catalog data with ${catalogResponse.data.length} products.`)

      // --- Step 4: Send the Data to the Backend Server ---
      // We send the entire response object to be saved in S3.
      await sendToBackend(catalogResponse, storeName)

   } catch (error) {
      log(`ERROR: Failed to fetch or process catalog data: ${error.message}`)
   }
})()

/**
 * Sends the extracted catalog data and store name to the backend server.
 * @param {object} data The full catalog data object from the API.
 * @param {string} storeName The name of the store extracted from the page.
 */
async function sendToBackend(catalogResponse, storeName) {
   // This is the endpoint where the catalog data will be sent.
   const HAGAR_BACKEND_URL = 'http://138.197.187.213:3000/api/ingest-catalog' // Production
   // const HAGAR_BACKEND_URL = 'https://a0f4e59ba8be.ngrok-free.app/api/ingest-catalog' // ngrok for local testing

   log(`Sending data for store '${storeName}' to backend at ${HAGAR_BACKEND_URL}...`)

   try {
      // We package the store name and the full catalog response into a single payload.
      const payload = {
         storeName: storeName,
         catalog: catalogResponse,
      }

      const response = await fetch(HAGAR_BACKEND_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify(payload)
      })

      if (!response.ok) {
         throw new Error(`Backend API response was not ok: ${response.statusText}`)
      }

      const result = await response.json()
      log('Successfully sent data to backend.')

   } catch (error) {
      log(`ERROR: Failed to send data to backend: ${error.message}`)
   }
}

/**
 * (Currently Unused) Saves the catalog data to a local JSON file.
 * @param {object} data The full catalog data object.
 * @param {string} filename The desired name for the downloaded file.
 */
function saveDataToFile(catalogResponse, filename) {
   try {
      const blob = new Blob([JSON.stringify(catalogResponse, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      log(`Data saved to ${filename}`)
   } catch (error) {
      log(`ERROR: Failed to save data to file: ${error.message}`)
   }
}
