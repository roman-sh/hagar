*   **Structured Logging (Pino)**: Detailed logs capture system events, AI interactions, and errors for debugging and operational monitoring.

---

## Flow 6: Rexail Back-Office Integration

This flow details how Hagar connects to the Rexail back-office system to perform essential setup tasks like authentication and catalog synchronization, which are prerequisites for the final inventory update stage.

### A. Authentication via Headless Browser

*   **Problem**: The Rexail back-office does not provide a direct API for generating authentication tokens.
*   **Solution**: Hagar automates the user login process using a headless browser controlled by **Puppeteer**.
    *   **Configuration**: The `stores` collection in MongoDB holds the necessary configuration for each store, including a `backoffice.url` and encrypted `username` and `password`.
    *   **Process**: When authentication is required, a Puppeteer instance is launched. It navigates to the login page, enters the decrypted credentials, and submits the form.
    *   **Token Extraction**: After a successful login, the browser is redirected to the main dashboard. The system then parses the HTML content of this page to find and extract the session token (named `tarfash`), which is typically embedded within a `<script>` tag.
    *   **Storage**: This extracted token is then stored and used in the `Authorization` header for all subsequent direct API calls to Rexail.

### B. On-Demand Catalog Synchronization

*   **Purpose**: To create and maintain a local, AI-ready copy of the store's complete product catalog. This local cache is essential for the AI to accurately match items from scanned invoices.
*   **Mechanism**: This process is handled by the `catalog.sync` service and combines API calls with intelligent local processing.
    *   **Throttling**: Before starting a sync, the service checks the `catalog.lastSync` timestamp in the store's configuration. If a sync was performed recently (e.g., within the last few hours), the process is skipped to avoid redundant API load. This can be bypassed with a `force` flag.
    *   **Intelligent Delta Updates**: The service fetches the full, fresh catalog from the Rexail API. Instead of overwriting everything, it compares the incoming products against the existing products in the local MongoDB collection.
        *   An **MD5 fingerprint** is generated for each product based on its key fields (name, description, barcodes). A change in the fingerprint indicates the product has been updated.
        *   This comparison efficiently identifies three groups: new products to add, existing products to update, and local products that no longer exist in Rexail and should be deleted.
    *   **Optimized Embedding Generation**: Vector embeddings, which are required for AI-powered similarity searches, are generated **only** for the new and updated products. This significantly reduces costs and processing time compared to re-embedding the entire catalog on every sync.
    *   **Batch Database Operations**: All database changes (inserts for new products, updates for modified ones, and deletions for stale ones) are executed in efficient, parallel batches for optimal performance.

---

## Flow 7: OCR Extraction & AI-Assisted Correction

This flow begins after a document has successfully passed the initial `scan_validation` stage and is queued for the `ocr_extraction` pipeline step. Its purpose is to convert the document image into structured, validated data, with a human-in-the-loop for quality assurance.

*   The `ocr_extraction` field in the MongoDB `scans` document is updated with the status "completed" and the structured line-item data. This data is now ready for the final `inventory_update` stage.

---

## Flow 8: Inventory Matching & Update (Implementation Plan)

This section details the revised design for the `inventory_update` pipeline stage. It uses a robust, pluggable architecture where each supported back-office inventory system is a self-contained module.

### A. Core Architecture: Named Processors & Shared Services

This design ensures that adding support for a new inventory system (e.g., "Odoo") is as simple as creating a new `odoo.ts` processor file in the `app/processors/inventory-update/` directory with its own internal sync logic, while reusing the same core matching and AI interaction flows.

---
## Summary of Design Achievements 