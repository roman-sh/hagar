# Hagar™ System Design: Flow & Architecture

## Overview

Hagar™ is an AI-assisted inventory management system designed to help retail stores automate the process of updating stock from supplier delivery notes (תעודות משלוח). Store managers simply scan a delivery note or send a PDF to a WhatsApp number. The system then uses a combination of OCR and AI to process the document, match the listed items to products in the store's back-office catalog, and prepare a draft inventory update. This draft is sent back to the manager on WhatsApp for a final, conversational review. Once approved, Hagar automatically updates the store's back-office inventory system, closing the loop from physical paper to digital record.

This document describes the system architecture by following the flow of data from ingestion to finalization, explaining key technology choices and design decisions at each stage.

---

## Core Architectural Principles

1.  **Conversational, Human-in-the-Loop AI**: The entire workflow is mediated through a simple WhatsApp conversation. While AI handles the heavy lifting of OCR and product matching, the user always has the final say, ensuring accuracy and allowing for the correction of ambiguous items.
2.  **Adaptive Learning System**: Hagar is designed to get smarter over time. Every manual correction or decision made by a user (e.g., matching a supplier's item to a store product, or permanently skipping an item) is saved. This history is used to automate the processing of future, similar invoices, reducing manual work with each use.
3.  **Pluggable & Extensible Architecture**: The core processing pipeline is generic. System-specific logic (e.g., for integrating with different back-office systems like Rexail or Priority) is encapsulated in dynamic modules. This integration is achieved by communicating directly with the private APIs used by the store's web-based back-office, using techniques like headless browsing to automate authentication and acquire session tokens when necessary. This means Hagar can connect to a wide range of inventory systems without needing official, public API access or provider involvement.
4.  **Cost-Optimized AI Usage**: The system uses a multi-model AI strategy to keep costs low. Expensive visual and audio models are used sparingly for initial analysis, while the bulk of the conversational logic is handled by more cost-effective text models. This "right tool for the right job" approach provides power without excessive expense.
5.  **Reliability through Asynchronicity**: All processing is handled by a robust, queue-based system (BullMQ + Redis). This ensures that every document is processed reliably, even if parts of the system are temporarily unavailable. It also allows for scalable, parallel processing of documents from multiple users while maintaining a simple, one-at-a-time conversational experience for each user.

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
*   **Dynamic Pipeline**: The specific queue a document enters (and subsequent steps) is determined by a `pipeline` array defined in the `stores` collection in MongoDB. This allows for configurable processing workflows per store (e.g., `["scan_validation", "ocr_extraction", "update-preparation", "inventory_update"]`). The `q` helper function manages transitions between pipeline stages.

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

### C. WhatsApp User Interface (WhatsApp Web.js + Bull.js)

*   **Inbound Message Ordering (Bee Queues)**: To ensure strict processing order for incoming messages from a single user, especially with time-consuming operations like audio transcription, each phone number has its own **inbound** Bee queue (`inbound:<phone>`) with `concurrency=1`. This prevents a later, faster-to-process text message from overtaking an earlier, slower audio message.
*   **Outbound Message Orchestration (Bull.js)**: All **outbound** messages are handled by the `ConversationManager`. As described at the end of this section, messages are added to the specific per-document Bull queue. If that document is the active context, the message is sent immediately. If not, it is buffered in that document's paused queue, waiting for its turn.
*   **Message Debouncing**: Rapid sequences of messages from a user are batched using a short delay (e.g., 1 second). This reduces the number of calls to the AI and provides better contextual understanding for multi-part messages.
*   **In-Memory Message Store**: Full WhatsApp `Message` objects (which contain methods like `.downloadMedia()`) are stored in an in-memory map (`messageStore`) because they cannot be directly serialized into queues. Message IDs are passed through queues instead.
*   **Conversation Flow**: The AI (via the text model) presents validation results to the user on WhatsApp. The user can confirm, ask questions (triggering `visualInspect`), or provide corrections. This human-in-the-loop process is critical for accuracy.
*   **Solving Conversational Concurrency: The `ConversationManager`**: A core challenge is handling users who upload multiple documents in quick succession. While the backend should process these documents in parallel for efficiency, the user-facing WhatsApp conversation must remain linear and focused on one document at a time to avoid confusion. This is solved by the **`ConversationManager`**, a central service that orchestrates the user experience. It maintains two key states:
    1.  **A Context Queue (Redis List)**: A strict FIFO (First-In, First-Out) queue for each user, which lists the `docId`s of all documents currently being processed. The document at the front of this queue is the **"active context"**.
    2.  **Per-Document Message Queues (Bull)**: Each document gets its own dedicated outbound message queue. These queues are **paused by default**.

    The `ConversationManager` ensures that only the message queue for the **active context** is running. All messages generated for other documents (e.g., draft-ready notifications) are safely buffered in their respective paused queues until it's their turn to become the active context. This architecture allows for a highly performant, concurrent backend while presenting a simple, serialized, and predictable conversational interface to the user.

---

## Flow 5: Validation Completion & Data Persistence

### A. Completing the Job & Advancing the Pipeline

*   When a pipeline stage is ready to be completed (either through automated processing or after user confirmation), the AI calls the appropriate finalization tool (e.g., `finalizeScanValidation`).
*   This tool, in turn, calls the `pipeline.advance()` service.
*   `pipeline.advance` finds the currently "active" Bull job for that document and **forcibly marks it as completed** (using `job.moveToCompleted()`), passing along the validated data. It also records this completion event in MongoDB for auditing purposes. It then immediately enqueues a new job for the document in the next stage of the pipeline (e.g., `ocr_extraction`).
*   **Graceful Context Handoff**: When a document completes its **final** pipeline stage, `pipeline.advance()` notifies the `ConversationManager` to schedule a context shift. The manager attaches a one-time `.once('completed', ...)` listener to the active document's outbound queue. After the AI sends its final closing message for the current document and that message job completes, the listener fires, triggering the context shift. This ensures the user receives all messages for one document before the conversation for the next one begins.

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
    *   If the annotation indicates the data is clean or was successfully auto-corrected, the processor calls the `finalizeOcrExtraction` tool directly. The job is marked "completed," and the document proceeds to the `update-preparation` stage without any human involvement.

*   **Path 2: Human-in-the-Loop (Unresolved Issues)**
    *   If the annotation flags unresolved issues, the processor does not complete the job. Instead, it triggers the main conversational AI by adding a message to the user's conversation with an action to `review_ocr_annotation`.
    *   The conversational AI (guided by `generic.md`) is now responsible for resolving the issues. It uses tools to:
        1.  `getOcrData`: Retrieve the partially cleaned data.
        2.  Present the problem to the user on WhatsApp, using the annotation for context.
        3.  Work with the user to fix the data conversationally.
        4.  Once resolved, call `finalizeOcrExtraction` with the final, corrected data.

### C. Completion and Persistence

*   The `finalizeOcrExtraction` tool marks the Bull job as "completed", passing the final, validated data as the job's return value.
*   The `ocr_extraction` field in the MongoDB `scans` document is updated with the status "completed" and the structured line-item data. This data is now ready for the `update-preparation` stage.

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
    *   **Lemmatization Pre-processing**: Storing the resulting lemmas alongside the products is a crucial pre-processing step. It enables the matching engine to directly and effectively query for products based on their linguistic root, significantly improving match accuracy.
    *   **Batch Database Operations**: All database changes (inserts for new products, updates for modified ones, and deletions for stale ones) are executed in efficient, parallel batches for optimal performance.

---

## Flow 7a: Alternative Workflow - Manual Back-Office Integration

This workflow provides a complete alternative to the automated back-office integration, designed for stores where the owner prefers not to provide direct system credentials. This enhances trust and simplifies onboarding by allowing the manager to mediate all interactions with their back-office system.

### A. Manual Catalog Ingestion via Chrome Extension

*   **Problem**: The system needs a fresh product catalog to perform accurate item matching, but does not have the credentials to fetch it automatically.
*   **Solution**: A dedicated Chrome Extension allows a logged-in store manager to act as the agent for fetching the catalog.
    *   **Architecture**: The extension uses a multi-script architecture to navigate browser security restrictions. A content script is injected into the webpage to scrape data, but to bypass the page's strict CORS and Content Security Policies, the final API call to the Hagar backend is delegated to a background service worker running in the extension's own privileged context.
    *   **Backend Process**: The extension sends the full catalog payload to the `/api/ingest-catalog` endpoint. The backend identifies the store and saves the raw catalog to a dedicated S3 path. This S3 file is then used during the `update-preparation` stage if the store's configuration has the `manualSync` flag set to `true`.

---

## Flow 8: Product Matching & Draft Preparation

This flow details the `update-preparation` pipeline stage, responsible for transforming a validated list of OCR'd line items into a fully resolved inventory draft. It is built on a robust, pluggable architecture where business logic is separated into distinct, configurable phases.

### A. Core Architecture: Pluggable Modules & Generic Processors

The system is designed for extensibility without requiring changes to the core processing logic.

*   **Generic Processor**: A single, generic `update-preparation` processor handles all jobs for this stage, regardless of the store's back-office system (e.g., Rexail, Odoo).
*   **Dynamic Module Loading**: The processor identifies the store's `backoffice.type` from its configuration and dynamically loads the corresponding module (e.g., from `src/systems/rexail/`). This module provides the system-specific implementations, primarily for catalog synchronization.
*   **System-Agnostic Matching Engine**: The core product matching logic is implemented as a series of system-agnostic "passes" (e.g., `historyPass`, `barcodePass`) that are reused across all systems.

This architecture ensures that adding support for a new inventory system is as simple as creating a new module directory with the required `catalog.ts` implementation. The generic processor and matching passes handle the rest automatically.

### B. The Preparation Pipeline: Abstract Phases

The processor executes a series of abstract phases to transform the raw data into a finalized draft.

1.  **Phase 1: Pre-processing & Catalog Sync**
    *   **Objective**: To prepare the environment by ensuring all necessary data is available and up-to-date.
    *   **Key Action**: The processor invokes the system-specific `catalog.sync` service from the dynamically loaded module.
    *   **Rationale**: This step guarantees that the matching engine is operating against a fresh, local copy of the store's product catalog, which is essential for accuracy.

2.  **Phase 2: Automated Matching Cascade**
    *   **Objective**: To automatically resolve as many line items as possible using a sequence of matching strategies, ordered from most to least certain.
    *   **Key Actions**: The processor iterates through a configurable array of matching "passes". An item resolved by one pass is excluded from subsequent ones.
        *   **`historyPass`**: Leverages previously approved manual matches and skips from past invoices to resolve items automatically. This allows the system to learn from the user's past decisions.
        *   **`barcodePass`**: Performs an exact match using the item's barcode against the local catalog. This is the most reliable method for unique identification.
        *   **`vectorPass`**: For items without exact matches, this pass generates a vector embedding of the item's name and finds semantically similar products in the catalog. It adds its findings to a list of potential candidates for the item.
        *   **`lemmasPass`**: Supplements the vector search by utilizing a dedicated, self-hosted microservice, adapted from an open-source library, to provide robust Hebrew lemmatization. This is particularly effective at handling construct-state forms (smichut) and finding products with the same linguistic root (e.g., matching "גבינת" to "גבינה"). Its findings are also added to the item's candidate list.
        *   **`aiPass`**: As a final step, this pass uses an AI model to review the original item name against the consolidated list of candidates generated by the `vectorPass` and `lemmasPass` to select the most likely match.

3.  **Phase 3: User Review and Correction**
    *   **Objective**: To present the auto-generated draft, manage user corrections conversationally, and finalize the document for the next stage.
    *   **Flow**:
        1.  The AI first sends the user a draft document (as a PDF) for review and waits for feedback. The system generates this PDF dynamically using React for Server-Side Rendering (SSR) to create an HTML representation of the inventory draft from a component (`InventoryConfirmation.tsx`), which is then converted to a PDF via a headless browser (Puppeteer).
        2.  When the user replies with changes, the system employs a **delta-based correction model** for efficiency. The AI gathers all requested fixes—such as re-matching a product, updating a quantity, or fixing the invoice date—and applies them as a minimal changeset rather than resubmitting the entire document. This is orchestrated through tools that allow the AI to first fetch the draft's context and then apply only the specific corrections.
        3.  For significant changes, a revised draft is sent back to the user for a final check. This iterative loop continues until the user confirms the draft is accurate.
        4.  Once approved, the AI finalizes the stage, persisting the corrected inventory document and advancing it in the pipeline.

---

## Flow 9: Final Inventory Update & System Integration

This represents the final, automated stage of the pipeline, where the user-verified document from the preparation stage is used to update the store's back-office inventory system.

### A. Core Architecture: Consistent Pluggable Design

This stage follows the same extensible architecture as the preceding one to ensure maintainability and scalability.

*   **Generic Processor**: A single, generic `inventory-update` processor handles all jobs for this stage. Its role is to orchestrate the high-level steps of the update.
*   **Dynamic Module Loading**: The processor dynamically loads a system-specific `updater` module (e.g., from `src/systems/rexail/update.ts`). This module encapsulates all the logic required to communicate with the target back-office system's API.

### B. The Update Pipeline: Abstract Phases

1.  **Phase 1: Pre-Update Snapshot**
    *   **Objective**: To create an audit trail and a mechanism for potential reversal.
    *   **Key Action**: Before making any changes, the processor first fetches the live, real-time data from the back-office system for every product that is about to be updated. This "before" snapshot is saved as a job artefact in MongoDB.
    *   **Rationale**: This design choice provides a critical layer of data integrity. If an update causes an issue, this snapshot contains the exact state of the products before the change, allowing for easier debugging and manual reversal.

2.  **Phase 2: System-Specific Update Execution**
    *   **Objective**: To delegate the final API communication to the specialized module.
    *   **Key Action**: The generic processor passes the pre-update snapshot and the user-approved inventory data to the dynamically loaded `updater` module.
    *   **System-Specific Logic**: The `updater` module is responsible for all vendor-specific logic. This includes constructing the precise API payload according to the back-office system's requirements and making the final API call to execute the inventory update.

3.  **Phase 3: AI Handoff & Finalization**
    *   **Objective**: To close the loop with the user and formally complete the document's journey.
    *   **Key Actions**:
        *   Upon a successful API response, the processor triggers the conversational AI with an `inventory_update_succeeded` event.
        *   The AI then calls the `finalizeInventoryUpdate` tool, which retrieves a pre-computed summary of the update. The AI relays this summary to the user and officially marks the document's pipeline as complete.

---

## Flow 10: Excel Export & Reporting (Alternative Output)

This alternative pipeline stage is designed for stores that cannot or prefer not to use direct API integration for inventory updates. It replaces Flow 9 in the pipeline configuration for such stores, offering a manual but streamlined "import-ready" workflow.

### A. Core Architecture: Pluggable Export Modules

Similar to other pipeline stages, this flow uses a generic `excel-export` processor that orchestrates the job but delegates the system-specific logic to dynamically loaded modules. This ensures the core pipeline remains agnostic while being able to generate highly specific file formats (e.g., for Rexail) that meet strict vendor requirements.

### B. The Export Process

The process is designed to bridge the gap between Hagar's data and the store's back-office without direct API access.

1.  **System-Specific File Generation**: The loaded exporter module transforms the finalized inventory data into a format that guarantees a successful import into the target back-office system. To minimize import errors, it employs a prioritized logic for identifying products: preferring system-known barcodes when available, falling back to internal IDs for manual lookup, and finally providing the supplier's raw item name for completely unmatched items. This ensures every line in the file is actionable for the store manager.

2.  **Delivery & Finalization**: The generated file is delivered directly to the store manager via WhatsApp. The AI then confirms the delivery and marks the document's processing journey as complete. This allows the manager to immediately upload the file using their back-office system's native import feature, effectively closing the inventory update loop manually.

---

## System Observability

A multi-layered approach to observability ensures system health can be monitored in real-time and issues can be debugged efficiently.

*   **Job & Queue Monitoring (Bull Board)**: The Bull Board dashboard provides a real-time web UI to inspect the state of all processing queues. It's the primary tool for operational visibility, allowing for monitoring of job statuses (active, completed, failed), viewing job data, and manually managing queues if necessary.

*   **Centralized Logging (Pino + Better Stack)**: The application uses Pino to generate structured, JSON-formatted logs for all significant events, AI interactions, and errors. These logs are streamed to **Better Stack**, a centralized log management platform. This provides powerful search capabilities, real-time log tailing, and the ability to create dashboards and alerts based on log patterns.

*   **Data Auditing (MongoDB)**: MongoDB serves as the ultimate system of record. It stores all document metadata, the complete processing state history for each pipeline stage, and the full user conversation history, providing a comprehensive and permanent audit trail for every document processed.

---

## Production Deployment & CI/CD
To keep operational overhead low, the entire system is deployed onto a single DigitalOcean droplet. **Nginx** is used as a reverse proxy to terminate SSL (via Let's Encrypt) and route incoming HTTPS traffic to the appropriate service. **Docker Compose** then orchestrates the application containers, which include the main Node.js app and a sidecar service for Hebrew lemmatization. The stack is configured to connect to the host's **native Redis server**, which is managed separately. GitHub Actions builds and publishes container images to GHCR on every push to `main`, enabling reproducible, one-command deployments and fast rollouts via layer caching.
