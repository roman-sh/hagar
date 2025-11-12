/**
 * Background service worker for the Rexail Catalog Sync extension.
 *
 * This script runs in the extension's own privileged context, not in the web page.
 * Its primary purpose is to listen for messages from the content script and perform
 * the cross-origin `fetch` request to the Hagar backend. This architecture is
 * necessary to bypass the page's restrictive Content Security Policy (CSP) and
 * Cross-Origin Resource Sharing (CORS) rules.
 */

// Production API endpoint
const HAGAR_BACKEND_URL = 'https://api.hagar.teivah.solutions/api/ingest-catalog'

// --- For Local Testing ---
// Use this URL and your ngrok tunnel to test with a local server.
// const HAGAR_BACKEND_URL = 'https://<your-ngrok-url>.ngrok-free.app/api/ingest-catalog'


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
   if (message && message.type === 'SEND_CATALOG') {
      const { storeName, catalog } = message

      chrome.runtime.sendMessage({ type: 'LOG', message: `Background: posting catalog for '${storeName}' to ${HAGAR_BACKEND_URL}...` })

      fetch(HAGAR_BACKEND_URL, {
         method: 'POST',
         headers: {
            'Content-Type': 'application/json',
         },
         body: JSON.stringify({ storeName, catalog })
      })
         .then(async res => {
            if (!res.ok) {
               const text = await res.text().catch(() => '')
               chrome.runtime.sendMessage({ type: 'LOG', message: `Background: backend responded ${res.status} ${res.statusText}` })
               sendResponse({ ok: false, status: res.status, statusText: res.statusText, body: text })
               return
            }
            const data = await res.json().catch(() => ({}))
            chrome.runtime.sendMessage({ type: 'LOG', message: 'Background: successfully sent catalog to backend.' })
            sendResponse({ ok: true, data })
         })
         .catch(err => {
            chrome.runtime.sendMessage({ type: 'LOG', message: `Background: network error - ${err?.message || 'unknown'}` })
            sendResponse({ ok: false, error: err?.message || 'Network error' })
         })

      // Keep the message channel open for async response
      return true
   }
})
