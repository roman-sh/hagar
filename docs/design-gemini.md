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
7.  **Self-Improving System**: The system learns from user actions. Manual corrections and decisions on one invoice are stored and used to automate the processing of future, similar invoices.

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
    *   **Objective**: To present the auto-generated draft for user review and facilitate corrections through a conversational interface.
    *   **Key Actions**:
        *   The conversational AI presents the initial draft to the user, typically as a formatted document.
        *   If the user requests changes, a conversational correction cycle begins. The AI leverages its search capabilities, which are powered by lemmatization, to find product alternatives based on user feedback.
        *   After each correction is confirmed, an updated version of the draft is generated and presented back to the user. This cycle repeats until all items are correct.
        *   All user-driven changes are marked with a `manual` match type for traceability.
        *   Once the user gives their final approval, the job is marked as complete, and the final, user-verified document is persisted.

---

## Flow 9: Back-Office System Integration

This represents the final stage of the pipeline, where the verified document from the preparation stage is used to update the store's official back-office system.

*   **Objective**: To apply the finalized data to the target inventory management system, completing the end-to-end workflow.
*   **Mechanism**: This stage is triggered after the `Product Matching & Draft Preparation` flow is successfully completed. It uses the same dynamic module system to load the appropriate integration logic for the specific store's back-office software.
*   **System-Specific Actions**: The loaded module contains the necessary code to communicate with the external system's API. This could involve a variety of actions, such as:
    *   Updating stock counts for received items.
    *   Adding new products to the catalog.
    *   Marking existing products as "active" or "visible" in an online store, effectively using recent invoices to curate the active catalog.
*   **Completion**: Once the back-office system confirms the update was successful, the processing journey for the document is complete.

---

## Summary of Design Achievements

This flow-based architecture achieves:

*   **Reliability**: Through robust hardware integration, persistent queues, and specific error handling techniques (like per-phone queues for message ordering).
*   **Cost Efficiency**: Primarily through the multi-model AI strategy that minimizes token usage for expensive media processing.
*   **User Experience**: Leverages the ubiquity of WhatsApp for a zero-training interface, with real-time feedback and conversational error resolution.
*   **Scalability**: Asynchronous queue-based processing, stateless components, and a database designed for growth allow the system to handle increasing load.
*   **Maintainability**: Clear separation of concerns between hardware interaction (Python on Pi), backend logic (Node.js), AI services, and data storage makes the system easier to develop, test, and debug. TypeScript enhances code quality and maintainability on the backend. 