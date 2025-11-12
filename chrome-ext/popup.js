document.addEventListener('DOMContentLoaded', () => {
   const getCatalogBtn = document.getElementById('getCatalogBtn')
   const logArea = document.getElementById('logArea')

   const logToPopup = (message) => {
      const now = new Date()
      const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      logArea.value += `[${time}] ${message}\n`
      logArea.scrollTop = logArea.scrollHeight // Auto-scroll to bottom
   }

   // Listen for log messages from the content script
   chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'LOG') {
         logToPopup(request.message)
      }
   })

   getCatalogBtn.addEventListener('click', async () => {
      logArea.value = '' // Clear log area on new run
      logToPopup('Injecting script...')

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (tab) {
         chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content-script.js']
         }, () => {
            if (chrome.runtime.lastError) {
               logToPopup(`Error injecting script: ${chrome.runtime.lastError.message}`)
            }
         })
      } else {
         logToPopup('No active tab found.')
      }
   })
})
