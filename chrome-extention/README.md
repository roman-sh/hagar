# Rexail Catalog Sync Extension

This Chrome extension allows a logged-in manager to extract the full product catalog from the Rexail backoffice website and send it directly to the Hagar backend API for processing.

## 🚀 How to Install and Use

1.  **Load the Extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" using the toggle in the top-right corner.
    *   Click the "Load unpacked" button.
    *   In the file dialog, select the `chrome-ext` directory from this project.

2.  **Run the Extractor:**
    *   Log in to the Rexail backoffice website.
    *   Click the extension's icon (the Hagar bee) in your Chrome toolbar.
    *   Click the "Sync Catalog" button in the popup.
    *   The extension will log its progress in the popup window.

## 🛠️ How it Works

*   `manifest.json`: Configures the extension, its permissions, and registers the background service worker.
*   `popup.html` / `popup.js`: The UI that appears when you click the extension icon. It initiates the process by injecting the content script.
*   `content-script.js`: The main orchestrator. It's injected into the backoffice page and performs the core logic: scraping the store name, getting the auth token (via `injector.js`), fetching the catalog from Rexail's API, and then sending the final data to `background.js`.
*   `injector.js`: Injected into the page's main context to access the global `tarfash` authentication token and pass it back to the content script.
*   `background.js`: A persistent service worker that runs in the extension's own privileged context. It receives data from the content script and performs the cross-origin `fetch` request to the Hagar API, bypassing the page's CORS restrictions.
*   `icons/`: Icons for the extension.

## 🧪 For Developers: Testing with a Local Server

To test the extension with a local development server, you need to make one change:

1.  **Update `background.js`:**
    *   Comment out the production `HAGAR_BACKEND_URL`.
    *   Uncomment and update the testing URL with your current `ngrok` address.
