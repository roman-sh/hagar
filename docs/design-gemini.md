# Hagar™ System Design: Flow & Architecture

## Overview

Hagar™ is an AI-powered inventory management system that transforms physical document scanning into automated digital workflows. This document describes the system architecture by following the **flow of data and processing**, explaining key technology choices and design decisions at each stage. The goal is to provide a high-level understanding of how the system works, why certain technologies are used, and how they interact.

---

## Core Architectural Principles

1.  **Flow-Centric Design**: The system is organized around the natural progression of data, from physical capture to digital processing and user interaction.
2.  **Separation of Concerns**: Different technologies are used for specific tasks (e.g., Pi for hardware, Node.js for backend, AI for intelligence, WhatsApp for UI).
3.  **Asynchronous Processing**: Heavy tasks (AI analysis, document processing) are handled in background queues to maintain a responsive user experience.
4.  **Human-in-the-Loop**: AI automates where possible, but human oversight via WhatsApp ensures accuracy and handles exceptions.
5.  **Cost Efficiency**: Multi-model AI architecture and message batching optimize for token usage and API call costs.
6.  **Scalability & Reliability**: Queue-based architecture, persistent storage, and robust error handling ensure the system can grow and recover gracefully.

---

## Flow 1: Document Ingestion - From Physical to Digital

### A. Physical Scanning (Raspberry Pi + Python)

*   **Hardware**: Fujitsu ScanSnap ix100 scanners are deployed at store locations, connected to Raspberry Pi devices.
*   **Software**: Custom Python scripts (`scan_monitor.py`, `pdf_utils.py`) on the Pi manage the scanning process.
    *   **Event Handling**: The `scanbd` daemon detects scanner button presses and page-load events, triggering Python scripts via OS signals (SIGUSR1, SIGUSR2). This is more efficient and responsive than polling.
    *   **Two-Phase Scanning**: A state machine (`adf_mode`) handles both single and multi-page documents. The first button press scans the first page and enters Automatic Document Feeder (ADF) mode. Subsequent pages are scanned automatically. The second button press finalizes the session.
    *   **PDF Creation**: Scanned images (PNG) for a session are stored in a temporary timestamped directory. Upon finalization, `img2pdf` converts these images into a single PDF. A counter mechanism ensures unique PDF filenames.

### B. Secure Upload (HTTP POST)

*   **Mechanism**: The Python script on the Raspberry Pi uploads the generated PDF directly to the backend Node.js server via an HTTP POST request to the `/api/pdf-upload` endpoint.
*   **Identification**: The Raspberry Pi's unique serial number is included as a query parameter (`deviceId`) for store identification.

### C. Direct Upload via WhatsApp

*   **Mechanism**: Store managers can also upload delivery notes by sending a PDF file directly to the system's WhatsApp number.
*   **Processing**: An inbound message processor (`inbound-messages-bee.ts`) detects messages with PDF attachments (`message.type === 'document'`).
*   **Identification**: The user's phone number is used to look up their associated `storeId`. Their WhatsApp name is used as the `author` for the document.

---

## Flow 2: Backend Reception & Unified Onboarding

This flow describes how documents from all ingestion channels are processed and stored in a consistent manner.

### A. Centralized Onboarding Service (`document.onboard`)

*   **Unified Entry Point**: All document uploads, whether from the Raspberry Pi (via `/api/pdf-upload`) or WhatsApp (via the message processor), are routed to a single, centralized `document.onboard` service. This ensures consistent processing for all incoming files.
*   **Arguments**: This service accepts a standardized object containing the `fileBuffer`, `filename`, `contentType`, `storeId`, `channel` ('scanner' or 'whatsapp'), and `author`.

### B. Multi-Layer Storage Strategy

1.  **AWS S3**: The PDF file buffer is immediately uploaded to an AWS S3 bucket. This provides durable, scalable, and cost-effective long-term storage for the original document.
2.  **OpenAI Files API**: The same file buffer is also uploaded to the OpenAI Files API. This makes the file accessible to OpenAI's AI models for analysis. OpenAI returns a `file_id`.
3.  **MongoDB**: Metadata about the scan (including the S3 URL, OpenAI `file_id`, `storeId`, `channel`, `author`, filename, etc.) is stored in a `scans` collection in MongoDB.
    *   The document `_id` in MongoDB is a composite key like `scan:<storeId>:<filename>`, providing a direct link between the stored data and the physical scan.

*   **Design Rationale**: This triple-storage approach ensures data persistence (S3), optimized AI accessibility (OpenAI Files), and fast metadata querying (MongoDB).

---

## Flow 3: Asynchronous Processing Pipeline

### A. Job Queuing (Bull + Redis)

*   **Mechanism**: After successful storage, a job is added to a Bull queue (e.g., `scan_validation`) for asynchronous processing. Redis serves as the backend for Bull, ensuring job persistence.
*   **Job Identification**: The MongoDB document `_id` is used as the `jobId` in Bull. This creates a direct, traceable link between the data and its processing job, simplifying lookups and monitoring via the Bull Board dashboard.
*   **Dynamic Pipeline**: The specific queue a document enters (and subsequent steps) is determined by a `pipeline` array defined in the `stores` collection in MongoDB. This allows for configurable processing workflows per store (e.g., `["scan_validation", "ocr_extraction", "inventory_update"]`). The `q` helper function manages transitions between pipeline stages.

### B. Scan Validation Processor (`app/processors/scan-validation.ts`)

*   **Job Activation**: The Bull queue worker picks up the `scan_validation` job.
*   **Conversation Bridge**: The processor adds a message to the `messages` collection in MongoDB, representing the uploaded document in the context of the store manager's WhatsApp conversation. This message includes the OpenAI `file_id`.
*   **AI Trigger**: It then invokes the `gpt.process` service to start AI analysis and user interaction.
*   **Active Wait State**: Crucially, the processor returns `new Promise(() => {})`. This keeps the Bull job in an "active" state (not "delayed" or "completed") indefinitely, effectively pausing the job queue processing for this document until an external event (user validation via an AI tool) completes it. This is supported by a very high concurrency setting (e.g., 100,000) for the Bull queue, allowing many jobs to be in this active-waiting state simultaneously across different users/stores.

---

## Flow 4: AI Analysis & User Interaction

### A. Multi-Model AI Strategy (OpenAI)

*   **Text Model (`gpt-4.1`)**: Orchestrates the conversation, understands user intent, selects appropriate tools, and formats responses. It maintains the conversation history (text-only for efficiency).
*   **Visual Model (`o3`)**: Used by tools like `validateDeliveryNote` and `visualInspect`. It analyzes the PDF content (via `file_id`) based on prompts from the text model, often returning structured JSON based on a predefined schema.
*   **Audio Model (`gpt-4o-transcribe`)**: Used by the `audio.transcribe` service to convert WhatsApp voice messages into text.

*   **Token Economics**: This multi-model approach is key for cost efficiency. Visual and audio processing (which are token-intensive) happen once per media item. The results (structured text or transcript) are then injected into the text-based conversation history. This keeps the ongoing conversation context cheap, as it doesn't repeatedly include large image or audio data.

### B. Tool-Based AI Operations

*   The text model doesn't directly analyze files. Instead, it calls functions (tools) like:
    *   `validateDeliveryNote`: Analyzes the document against a schema for key invoice details (number, supplier, date, items). Returns structured JSON.
    *   `visualInspect`: Performs custom visual analysis based on a specific user query/prompt.
    *   `finalizeScanValidation`: Called when the user confirms the validation, this tool completes the hanging Bull job.

### C. WhatsApp User Interface (WhatsApp Web.js + Bee Queues)

*   **Message Handling**: Incoming WhatsApp messages are received by the `whatsapp-web.js` client.
*   **Per-Phone Queues (Bee)**: To ensure correct message processing order, especially with time-consuming operations like audio transcription, each phone number has its own Bee queue (`inbound:<phone>`) with `concurrency=1`. This prevents a later, faster-to-process text message from overtaking an earlier, slower audio message from the same user.
*   **Message Debouncing**: Rapid sequences of messages from a user are batched using a short delay (e.g., 1 second). This reduces the number of calls to the AI and provides better contextual understanding for multi-part messages.
*   **In-Memory Message Store**: Full WhatsApp `Message` objects (which contain methods like `.downloadMedia()`) are stored in an in-memory map (`messageStore`) because they cannot be directly serialized into queues. Message IDs are passed through queues instead.
*   **Conversation Flow**: The AI (via the text model) presents validation results to the user on WhatsApp. The user can confirm, ask questions (triggering `visualInspect`), or provide corrections. This human-in-the-loop process is critical for accuracy.

---

## Flow 5: Validation Completion & Data Persistence

### A. Completing the Job

*   When the user confirms the document validation (e.g., by replying "approve" on WhatsApp), the AI text model calls the `finalizeScanValidation` tool.
*   This tool retrieves the corresponding Bull job (using the document ID which is also the job ID) and uses `job.moveToCompleted()` to mark it as finished, passing the extracted and validated data (invoice number, supplier, date, etc.) as the job's return value.
*   The `scan_validation` field in the MongoDB `scans` document is updated with the status "completed" and the extracted data.

### B. Monitoring & Audit

*   **Bull Board**: Provides a web UI to monitor job statuses (active, completed, failed), view job data, and manage queues.
*   **MongoDB**: Serves as the system of record, storing all document metadata, processing states, and conversation history, providing a comprehensive audit trail.
*   **Structured Logging (Pino)**: Detailed logs capture system events, AI interactions, and errors for debugging and operational monitoring.

---

## Flow 6: OCR Extraction & AI-Assisted Correction

This flow begins after a document has successfully passed the initial `scan_validation` stage and is queued for the `ocr_extraction` pipeline step. Its purpose is to convert the document image into structured, validated data, with a human-in-the-loop for quality assurance.

### A. Automated OCR & Data Sanitation (`ocr_extraction` Processor)

*   **Job Activation**: A Bull queue worker picks up the `ocr_extraction` job.
*   **High-Resolution OCR**: The processor sends the document PDF to a high-resolution OCR service to extract all line items into a structured JSON array, where each object represents a page.
*   **Automated AI Review**: The raw OCR output is immediately passed to a specialized, non-conversational AI model guided by the `ocr-review.md` prompt. This AI acts as a data sanitation layer:
    *   **Structural Integrity**: Its most critical task is to handle multi-page documents. It uses the header row of the first page as the canonical header and ensures it is present on all subsequent pages, inserting it if necessary. It also identifies and **deletes** entire pages that have a different, incompatible structure, re-numbering subsequent pages to maintain sequence.
    *   **Transcription Correction**: It reviews data for common OCR mistakes (e.g., "I" for "1", "O" for "0") and corrects them if it has high confidence.
*   **Annotated Handoff**: The sanitation AI returns the cleaned data along with a natural-language `annotation` that summarizes all actions taken (e.g., "Added headers to page 2") and explicitly lists any issues it could not resolve (e.g., "Row 5 has an unreadable quantity"). The processor then saves this result.

### B. AI-Mediated User Review & Correction

Based on the content of the `annotation`, the process forks:

*   **Path 1: Fully Automated (No Issues)**
    *   If the annotation indicates the data is clean or was successfully auto-corrected, the processor calls the `finalizeOcrExtraction` tool directly. The job is marked "completed," and the document proceeds to the `inventory_update` stage without any human involvement.

*   **Path 2: Human-in-the-Loop (Unresolved Issues)**
    *   If the annotation flags unresolved issues, the processor does not complete the job. Instead, it triggers the main conversational AI by adding a message to the user's conversation with an action to `review_ocr_annotation`.
    *   The conversational AI (guided by `generic.md`) is now responsible for resolving the issues. It uses tools to:
        1.  `getOcrData`: Retrieve the partially cleaned data.
        2.  Present the problem to the user on WhatsApp, using the annotation for context.
        3.  Work with the user to fix the data conversationally.
        4.  Once resolved, call `finalizeOcrExtraction` with the final, corrected data.

### C. Completion and Persistence

*   The `finalizeOcrExtraction` tool marks the Bull job as "completed", passing the final, validated data as the job's return value.
*   The `ocr_extraction` field in the MongoDB `scans` document is updated with the status "completed" and the structured line-item data. This data is now ready for the final `inventory_update` stage.

---

## Flow 7: Back-Office Integration (Rexail Example)

This flow details how Hagar connects to a back-office system (using Rexail as an example) to perform essential setup tasks like authentication and catalog synchronization, which are prerequisites for the inventory update stage.

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

## Flow 8: Inventory Update & Matching Workflow

This section details the revised design for the `inventory_update` pipeline stage. It uses a robust, pluggable architecture where each supported back-office inventory system is a self-contained module.

### A. Core Architecture: Pluggable Modules & A Multi-Pass System
The design uses Bull's **named processors** to route jobs to specific handlers within a single queue, enabling a pluggable architecture for supporting different back-office systems.

*   **Single `inventory_update` Queue**: All inventory-related jobs are pushed to this single queue.
*   **Job Naming**: A job's `name` property is set to the inventory system it targets (e.g., "rexail"), which directs it to the correct processor handler.
*   **Standardized Processor, Pluggable Modules**: While each system (like Rexail) has a named processor, the core logic within these processors is standardized. The key to the plug-and-play design lies in system-specific modules that are imported by the processor. For each system, there are dedicated modules for `catalog.sync` and final `inventory.update`. This means the processor itself follows the same sequence of operations for every system, but calls out to the specific implementation for that system's catalog and API.
*   **Generic Multi-Pass Matching**: The core matching workflow is broken down into a series of modular, system-agnostic "passes" (`barcodePass`, `vectorPass`, `aiPass`). Every processor calls these same passes in the same sequence. This decouples the sophisticated matching logic from the system-specific integration details.
*   **Future Refinement: The Registry Pattern**: A known limitation of the current approach is that it requires creating a separate, near-identical processor file for each back-office system, violating the DRY (Don't Repeat Yourself) principle. A superior, bundler-friendly solution has been designed and is documented in `docs/registry_pattern.md`. This "Registry Pattern" will allow for a single, generic processor that dynamically uses the correct system-specific modules at runtime, eliminating code duplication and improving maintainability. This is the intended direction for a future refactor.

### B. Processor Workflow Example: The Journey of the Cheese Invoice

To illustrate the architecture in action, let's follow a real invoice (`cheese.pdf`) with 8 line items as it moves through the `rexail` processor.

1.  **Phase 1: On-Demand Catalog Sync**
    *   **Action**: The processor's first job is to ensure the local product catalog is up-to-date by calling the `catalog.sync` service.
    *   **Rationale**: The accuracy of all subsequent matching depends on a fresh and complete catalog. The sync is throttled to avoid unnecessary API calls, but for this example, it proceeds, ensuring the local MongoDB `products` collection is a mirror of the Rexail back-office, complete with vector embeddings for all items.

2.  **Phase 2: The Multi-Pass Matching Cascade**
    *   **Rationale**: The system uses a cascading series of "passes," moving from the most certain matching method to the most sophisticated. This is efficient and maximizes accuracy. An item resolved in an early pass is removed from consideration in later passes.
    *   **Action (`barcodePass`)**: The processor first sends all 8 items to the `barcodePass`. 7 of the items have barcodes that match a single, unique product in the catalog. They are immediately resolved. One item, "קפרינו רומנו - מנות", has a barcode that is not found in the catalog, so it remains unresolved. If a partial barcode (often the last 7 digits of a full barcode, used for brevity on invoices) were to match multiple products, those products would be added as candidates for the first `aiPass` to resolve.
    *   **Action (`vectorPass`)**: The single unresolved item is passed to the `vectorPass`. It generates a vector embedding for the name and finds the top 3-5 most semantically similar products, attaching them to the item as a `candidates` array. The purpose of this pass is to efficiently generate a small, relevant set of potential matches for the subsequent AI-driven resolution step.
    *   **Action (`aiPass`)**: The item, now enriched with its candidate list, proceeds to the `aiPass`. Here, a prompt is constructed showing the AI the original name and its candidates. To provide richer context and help differentiate between items sold by weight versus by unit, both the original item name and the candidate names are enhanced with their unit of measurement where available. The AI is prompted to return its selection in a structured, machine-readable format. It correctly identifies the best match and returns its selection. If the AI determines that no candidate is a suitable match, it is instructed to indicate this, leaving the item unresolved for a subsequent processing step.
    *   **(Future Enhancement) Regex Fallback**: The design allows for a future enhancement where, if the AI determines all vector candidates are unsuitable, it could be trained to call a `runRegexSearch` tool to perform a keyword-based search as a final attempt before giving up.

3.  **Phase 3: Finalization**
    *   **Action**: With all 8 items now resolved (7 by barcode, 1 by the vector/AI flow), the processor can proceed to the finalization stage.
    *   **Rationale**: The fully resolved data is now ready to be presented to the user for final confirmation, after which it will be sent to the Rexail back-office system to update the official inventory.

This design ensures that adding support for a new inventory system (e.g., "Odoo") is as simple as creating a new `odoo.ts` processor file in the `app/processors/inventory-update/` directory with its own internal sync logic, while reusing the same core multi-pass matching and AI interaction flows.

---

## Summary of Design Achievements

This flow-based architecture achieves:

*   **Reliability**: Through robust hardware integration, persistent queues, and specific error handling techniques (like per-phone queues for message ordering).
*   **Cost Efficiency**: Primarily through the multi-model AI strategy that minimizes token usage for expensive media processing.
*   **User Experience**: Leverages the ubiquity of WhatsApp for a zero-training interface, with real-time feedback and conversational error resolution.
*   **Scalability**: Asynchronous queue-based processing, stateless components, and a database designed for growth allow the system to handle increasing load.
*   **Maintainability**: Clear separation of concerns between hardware interaction (Python on Pi), backend logic (Node.js), AI services, and data storage makes the system easier to develop, test, and debug. TypeScript enhances code quality and maintainability on the backend. 