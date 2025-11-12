# Backoffice Catalog Extractor

This Chrome extension allows a logged-in manager to extract the full catalog data from the backoffice website and either save it as a JSON file or send it to a designated backend API.

## 🚀 How to Install and Use

1.  **Clone/Download this Directory:** Make sure you have the `chrome-ext` folder on your computer.

2.  **Configure the Extension:**
    *   Open `manifest.json`.
    *   Find the `host_permissions` section.
    *   Replace `"http://*.example-backoffice.com/*"` with the actual URL of the backoffice website.
    *   Replace `"https://*.your-backend-api.com/*"` with the actual URL of your backend API endpoint.
    *   Open `content-script.js`.
    *   Replace the placeholder `API_ENDPOINT` with the correct catalog API endpoint you discover.
    *   Replace `YOUR_BACKEND_URL` with your backend endpoint.
    *   Choose whether you want to `sendToBackend` or `saveDataToFile` by commenting/uncommenting the relevant line.

3.  **Load the Extension in Chrome:**
    *   Open Chrome and navigate to `chrome://extensions`.
    *   Enable "Developer mode" using the toggle in the top-right corner.
    *   Click the "Load unpacked" button that appears.
    *   Select the `chrome-ext` directory.

4.  **Run the Extractor:**
    *   Log in to the backoffice website.
    *   Navigate to the page where the catalog is visible.
    *   Click the extension's icon in your Chrome toolbar.
    *   Click the "Fetch and Process Catalog" button.

## 🛠️ How it Works

*   `manifest.json`: Configures the extension, its permissions, and UI.
*   `popup.html` / `popup.js`: The simple UI that appears when you click the extension icon. It's responsible for injecting the content script.
*   `content-script.js`: The core logic. It gets injected into the backoffice webpage and runs in its context, allowing it to make authenticated API calls. It fetches the data and then processes it.
*   `icons/`: Placeholder icons for the extension.
