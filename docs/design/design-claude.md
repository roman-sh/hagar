# Hagar™ System Architecture & Technology Design

## Overview

Hagar™ processes Hebrew delivery invoices through a technology stack designed for **reliability**, **cost efficiency**, and **user experience**. This document explains each technology choice and how they work together to create an intelligent document processing system.

## Technology Stack

**Runtime & Language**
- **Node.js + TypeScript**: Backend runtime with type safety
- **Hono Framework**: Lightweight web framework for API endpoints

**Storage & Data**
- **AWS S3**: PDF file storage and retrieval
- **MongoDB**: Document and conversation data
- **Redis**: Queue storage and message debouncing

**AI & Communication**
- **OpenAI APIs**: Multi-model AI integration
- **WhatsApp Web.js**: WhatsApp messaging integration

## System Data Flow

```
Scanner/Pi → S3 Storage → OpenAI Models → Bull Queues → Redis → MongoDB
     ↓          ↓            ↓              ↓          ↓        ↓
   Upload   File Store   AI Analysis    Job Mgmt   Queue Store  Data Store
```

---

## 1. Scanner + Raspberry Pi Integration

### What It Does
Physical document acquisition and immediate digital upload to the backend system.

### Technology Stack
- **Hardware**: Fujitsu ScanSnap ix100 compact scanner
- **Platform**: Raspberry Pi 4 with Python services
- **Software**: Custom Python scripts for scanner event handling
- **Upload**: Direct HTTP POST to backend API

### Key Design Decisions

**Direct HTTP Upload Architecture**
- **Implementation**: HTTP POST to `/api/pdf-upload`
- **Benefits**: Immediate processing (sub-second), full error control, simple integration
- **Requirements**: Network connectivity, backend API endpoint

**Two-Button Scanner Workflow**
```python
# First button press: Scan page, enter ADF mode
# Additional pages: Auto-scan when detected  
# Second button press: Finalize session, upload PDF
```
- **Why**: Handles both single and multi-page documents elegantly
- **User Experience**: Predictable workflow, visual feedback via LEDs

**Scanner Event Handling**
```python
# scan_monitor.py architecture
signal.signal(signal.SIGUSR1, handle_scan_button)    # Scan button
signal.signal(signal.SIGUSR2, handle_page_loaded)    # Page detection
```
- **Reliability**: Signal-based event handling, graceful recovery
- **Integration**: SANE library for scanner control, img2pdf for PDF creation

### Integration Points
- **Backend**: POST to `/api/pdf-upload?deviceId={raspberry_pi_serial}`
- **Identification**: Each Pi identified by unique serial number
- **Error Handling**: HTTP upload status, LED status indicators

---

## 2. WhatsApp Integration (WhatsApp Web.js)

### What It Does
Real-time messaging interface for user interaction using WhatsApp as the communication platform.

### Technology Choice

**WhatsApp Web.js Library**
- **Implementation**: Connects to WhatsApp Web via browser automation
- **Benefits**: Full WhatsApp features, no official API costs, rich media support
- **Trade-offs**: Requires stable connection, dependent on WhatsApp Web availability

### Integration Benefits
- **Zero User Training**: Everyone knows WhatsApp interface
- **Rich Media**: Text, voice messages, PDF sharing, emojis
- **Push Notifications**: Immediate alerts to users' phones
- **Network Effects**: Already installed on all user devices

### Message Processing Architecture
```javascript
// Per-phone inbound queues for conversation integrity
inbound_messages_phone_972546313551
inbound_messages_phone_972546313552

// Single outbound queue for rate limiting
outbound_messages_bee
```

**Message Flow:**
1. WhatsApp message received → stored in message store
2. Added to phone-specific queue → ensures order
3. Debounced processing → batches rapid messages
4. GPT processes with full conversation context
5. Response sent via outbound queue

---

## 3. AWS S3 File Storage

### What It Does
Persistent storage for PDF documents with integration to OpenAI Files API.

### Storage Strategy
- **Upload**: PDFs stored immediately after scanner upload
- **Access**: Pre-signed URLs for secure file access
- **Integration**: Files uploaded to OpenAI for AI analysis
- **Retention**: Long-term storage for audit and reference

### Integration Points
```javascript
// Document flow
Scanner Upload → S3 Storage → OpenAI Files API → AI Analysis
```

**Document Lifecycle:**
1. PDF uploaded to S3 with unique key
2. S3 URL stored in MongoDB scan document
3. File uploaded to OpenAI Files API for analysis
4. OpenAI file_id stored for tool access

---

## 4. OpenAI Models Architecture

### What It Does
Multi-model AI architecture for conversation orchestration, document analysis, and voice transcription.

### Model Usage Strategy

**Text Model (Conversation Orchestration)**
```javascript
model: 'gpt-4.1-mini'
```
- **Purpose**: Conversation flow, tool selection, business logic
- **Context**: Full conversation history with tool calls
- **Cost**: Optimized for long conversations (text-only context)

**Visual Model (Document Analysis)**
```javascript
model: 'o3'  // Called via tools only
```
- **Purpose**: PDF analysis, data extraction
- **Context**: Single document + specific prompt
- **Cost**: Expensive but one-time per document

**Audio Model (Voice Transcription)**
```javascript
model: 'gpt-4o-transcribe'  // Called for voice messages
```
- **Purpose**: Convert WhatsApp voice messages to text
- **Context**: Single audio file per transcription
- **Integration**: Enables voice input in conversations

### Token Economics Design

**Problem with Single Model:**
```
Every conversation turn includes expensive image tokens → Unsustainable costs
```

**Solution with Multi-Model Architecture:**
```
1. Visual model analyzes documents → Returns structured text
2. Audio model transcribes voice → Returns text transcription  
3. Text model handles conversation → Uses text-only context
4. Long conversations scale without expensive media tokens
```

### Tool-Based Architecture

**Document Validation Tool**
```javascript
validateDeliveryNote({file_id}) → {
  scan_quality: {...},
  document_details: {...}, 
  table_structure: {...},
  overall_assessment: {...}
}
```
- **JSON Schema**: Enforces structured output format
- **Single Purpose**: Document validation and key field extraction
- **Integration**: Called by text model when document uploaded

**Flexible Analysis Tool**
```javascript
visualInspect({file_id, prompt}) → "Custom analysis response"
```
- **Dynamic**: Accepts custom prompts for specific questions
- **User-Driven**: Called when users ask specific document questions
- **Conversation Integration**: Results incorporated into chat flow

### AI Integration Benefits
- **Separation of Concerns**: Conversation logic separate from document processing
- **Cost Control**: Visual analysis only when needed
- **Structured Data**: Consistent outputs via JSON schemas
- **Scalability**: Text model handles unlimited conversation length

---

## 5. Bull Queues System

### What It Does
Job-based processing pipeline with Redis backend for reliable document workflow management.

### Queue Architecture

**Document Processing Pipeline**
```javascript
scan_validation → [planned: ocr_extraction → inventory_update]
```

**Message Processing Queues**
```javascript
// Per-phone inbound queues (Bee)
inbound_messages_phone_972541234567
inbound_messages_phone_972541234568

// Single outbound queue (Bee) 
outbound_messages_bee
```

### Design Decisions

**Why Separate Queues Per Phone**
```
Problem: Audio message transcription takes more time → later text messages process first → wrong order
Solution: Per-phone queues with concurrency=1 ensure correct message sequence
```

**Example Scenario:**
```
User sends: Audio message (10s transcription) → Text message (instant)
Shared queue: Text processes first → breaks conversation order
Per-phone queue: Audio completes first → then text → correct order
```

**Benefits:**
- **Sequential Processing**: Messages processed in send order regardless of processing time
- **Parallel Users**: Multiple phones can process simultaneously
- **Concurrency Control**: Each phone queue runs one job at a time

**Queue Technology Choice: Bull vs Bee**
- **Bull**: Document processing jobs (scan validation, data extraction)
  - Why: Redis persistence, job state management, monitoring dashboard
- **Bee**: Message processing (inbound/outbound WhatsApp)
  - Why: Memory-based, faster for real-time messaging

### Job State Management

**Document Processing Flow**
```
1. PDF Upload → scan_validation job created
2. Job processes → sends file to GPT conversation
3. Job remains in active state until user validates
4. User confirms → finalizeScanValidation tool completes the job
```

**High Concurrency Design**
- **Concurrency**: 100,000 concurrent jobs per queue
- **Purpose**: Allows many users to have documents waiting for user interaction simultaneously

**Message Debouncing**
```javascript
// 1-second delay after each message
// Additional messages reset timer → batches rapid messages
```
- **Purpose**: Reduce API calls to OpenAI

### Monitoring & Reliability
- **Bull Dashboard**: Real-time job monitoring, view jobs waiting for user interaction
- **Redis Persistence**: Jobs survive server restarts
- **Interactive Processing**: No retries to maintain responsive user experience

---

## 6. Redis Integration

### What It Does
Queue storage backend and caching layer for the entire system.

### Usage Patterns

**Queue Storage (Primary)**
```javascript
// Bull queue jobs stored in Redis
scan_validation:active  
scan_validation:completed
scan_validation:failed
```

**Message Debouncing**
```javascript
// Temporary delay timers for message batching
debounce_timer:phone_972541234567
```

### Integration Benefits
- **Reliability**: Queue persistence across server restarts
- **Monitoring**: Rich queue metrics via Bull dashboard

---

## 7. MongoDB Data Architecture

### What It Does
Persistent storage for documents, conversations, and system state using homogeneous collections strategy.

### Collection Design Strategy

**Homogeneous Collections (Current)**
```javascript
// Separate collections by document type
scans_collection     // Document metadata and processing state
messages_collection  // Conversation history  
stores_collection    // Store configuration
```

### Document Schemas

**Scan Documents**
```javascript
{
  "_id": "scan:store_id:filename.pdf",
  "type": "scan",
  "storeId": "organi_ein_karem",
  "fileId": "file-OpenAIFileId",        // OpenAI Files API reference
  "filename": "img20250402_0002.pdf",
  "url": "https://s3-bucket-url",       // S3 storage location
  "scan_validation": {                  // Processing results
    "status": "completed",
    "data": {
      "invoiceNo": "6775971",
      "supplier": "הנבטים של אודי בע\"מ",
      "date": "2025-02-26",
      "pages": 1
    }
  }
}
```

**Message Documents**
```javascript
{
  "_id": "unique_message_id",
  "type": "message", 
  "role": "user|assistant|tool",
  "phone": "972541234567",
  "storeId": "organi_ein_karem",
  "content": "parsed_message_content",
  "tool_calls": [...],                  // AI function calls (if any)
  "createdAt": "2025-01-27T..."
}
```

**Store Documents**
```javascript
{
  "_id": "store_organi_ein_karem",
  "type": "store",
  "system": "rexail",                   // External inventory system
  "storeId": "organi_ein_karem",
  "manager": {
    "name": "רומן",
    "phone": "972546313551"            // WhatsApp contact
  },
  "pipeline": [                        // Document processing stages
    "scan_validation",
    "ocr_extraction", 
    "inventory_update"
  ],
  "deviceId": "10000000da1dac07"       // Raspberry Pi serial number
}
```

### Data Flow Integration

**Conversation Context Building**
```javascript
// Retrieve full conversation history for AI context
const messages = await database.getMessages(phone, storeId)
const history = composeHistory(messages)  // Format for OpenAI API
```

**Job Progress Tracking**
```javascript
// Update document with processing results
await database.recordJobProgress(docId, jobType, result)
```

### Benefits of Design
- **Rich Context**: Complete conversation history for AI
- **Audit Trail**: Full processing history per document
- **Query Performance**: Type-specific collections optimize common queries
- **Debugging**: Tool calls and responses preserved for analysis

---

## Technology Integration Summary

### Data Flow Through Stack
```
1. Scanner/Pi → Direct upload via HTTP
2. MongoDB → Store document metadata  
3. Bull Queue → Create scan validation job
4. OpenAI → Analyze document via tools
5. Redis → Manage job state and message timing
6. MongoDB → Store conversation and results
```

### Key Architectural Benefits

**Reliability**
- Redis persistence for queue reliability
- MongoDB for audit trails and context
- Direct scanner integration eliminates email dependencies

**Cost Efficiency** 
- Dual OpenAI model architecture optimizes token usage
- Queue-based processing handles spikes efficiently
- Per-phone queues prevent resource contention

**Scalability**
- Queue-based architecture supports horizontal scaling
- MongoDB collections designed for sharding
- Redis can be distributed across instances

**User Experience**
- WhatsApp integration requires zero training
- Message debouncing creates natural conversation flow  
- Real-time processing via direct scanner upload

**Maintainability**
- Technology separation enables independent scaling
- Rich monitoring via Bull dashboard and logging
- Clear data models support debugging and enhancement 