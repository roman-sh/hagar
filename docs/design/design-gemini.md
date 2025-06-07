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

---

## Flow 2: Backend Reception & Initial Storage

### A. API Handling (Node.js + Hono)

*   **Endpoint**: The `/api/pdf-upload` endpoint in the Node.js backend (built with Hono framework) receives the multipart form data containing the PDF file and `deviceId`.

### B. Multi-Layer Storage Strategy

1.  **AWS S3**: The PDF file buffer is immediately uploaded to an AWS S3 bucket. This provides durable, scalable, and cost-effective long-term storage for the original document.
2.  **OpenAI Files API**: The same file buffer is also uploaded to the OpenAI Files API. This makes the file accessible to OpenAI's AI models for analysis. OpenAI returns a `file_id`.
3.  **MongoDB**: Metadata about the scan (including the S3 URL, OpenAI `file_id`, `storeId` (mapped from `deviceId`), filename, etc.) is stored in a `scans` collection in MongoDB.
    *   The document `_id` in MongoDB is a composite key like `scan:<storeId>:<filename>`, providing a direct link between the stored data and the physical scan.

*   **Design Rationale**: This triple-storage approach ensures data persistence (S3), optimized AI accessibility (OpenAI Files), and fast metadata querying (MongoDB).

---

## Flow 3: Asynchronous Processing Pipeline

### A. Job Queuing (Bull + Redis)

*   **Mechanism**: After successful storage, a job is added to a Bull queue (e.g., `scan_validation`) for asynchronous processing. Redis serves as the backend for Bull, ensuring job persistence.
*   **Job Identification**: The MongoDB document `_id` is used as the `jobId` in Bull. This creates a direct, traceable link between the data and its processing job, simplifying lookups and monitoring via the Bull Board dashboard.
*   **Dynamic Pipeline**: The specific queue a document enters (and subsequent steps) is determined by a `pipeline` array defined in the `stores` collection in MongoDB. This allows for configurable processing workflows per store (e.g., `["scan_validation", "data_extraction", "inventory_update"]`). The `q` helper function manages transitions between pipeline stages.

### B. Scan Validation Processor (`app/processors/scan-validation.ts`)

*   **Job Activation**: The Bull queue worker picks up the `scan_validation` job.
*   **Conversation Bridge**: The processor adds a message to the `messages` collection in MongoDB, representing the uploaded document in the context of the store manager's WhatsApp conversation. This message includes the OpenAI `file_id`.
*   **AI Trigger**: It then invokes the `gpt.process` service to start AI analysis and user interaction.
*   **Active Wait State**: Crucially, the processor returns `new Promise(() => {})`. This keeps the Bull job in an "active" state (not "delayed" or "completed") indefinitely, effectively pausing the job queue processing for this document until an external event (user validation via an AI tool) completes it. This is supported by a very high concurrency setting (e.g., 100,000) for the Bull queue, allowing many jobs to be in this active-waiting state simultaneously across different users/stores.

---

## Flow 4: AI Analysis & User Interaction

### A. Multi-Model AI Strategy (OpenAI)

*   **Text Model (`gpt-4.1-mini`)**: Orchestrates the conversation, understands user intent, selects appropriate tools, and formats responses. It maintains the conversation history (text-only for efficiency).
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

## Flow 6: Future - OCR & Inventory Integration (Planned)

*   **Current State**: Basic document details are extracted using OpenAI's visual model (`o3`).
*   **Next Stage**: The processing pipeline (defined in `stores` collection) includes a `data_extraction` step. This is planned to integrate with Azure Form Recognizer (or another specialized OCR service) to extract detailed line-item information from invoice tables.
*   **Inventory Update**: A subsequent `inventory_update` step will then use this extracted structured data to integrate with external inventory management systems (e.g., "rexail" as noted in the `stores` document).

---

## Summary of Design Achievements

This flow-based architecture achieves:

*   **Reliability**: Through robust hardware integration, persistent queues, and specific error handling techniques (like per-phone queues for message ordering).
*   **Cost Efficiency**: Primarily through the multi-model AI strategy that minimizes token usage for expensive media processing.
*   **User Experience**: Leverages the ubiquity of WhatsApp for a zero-training interface, with real-time feedback and conversational error resolution.
*   **Scalability**: Asynchronous queue-based processing, stateless components, and a database designed for growth allow the system to handle increasing load.
*   **Maintainability**: Clear separation of concerns between hardware interaction (Python on Pi), backend logic (Node.js), AI services, and data storage makes the system easier to develop, test, and debug. TypeScript enhances code quality and maintainability on the backend. 