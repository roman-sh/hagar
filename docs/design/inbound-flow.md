# Inbound Messages & Validation Queue Design

## Overview

This document outlines the design for our message processing system, consisting of:
1. A platform-agnostic inbound message queue
2. A validation queue with pause/resume pattern for user interaction

## Inbound Messages Queue

### Purpose
- Provide a unified entry point for messages from multiple platforms
- Standardize message format before further processing
- Abstract away platform-specific details

### Input Sources
- **Scanner**: Physical documents scanned via ScanSnap
- **WhatsApp**: PDF files and messages sent via WhatsApp
- **Future**: Telegram and other messaging platforms

### Platform Adapters
- Each input source has a dedicated adapter
- Adapters normalize content into standard format
- Adapters add source identification and metadata
- Adapters handle platform-specific authentication/APIs

### Standard Message Format
```json
{
  "type": "file",
  "source": "whatsapp|scanner|telegram",
  "content": {
    "filename": "invoice_123.pdf",
    "contentType": "application/pdf"
  },
  "metadata": {
    "sender": "user123",
    "timestamp": "2023-09-12T15:30:00Z"
  }
}
```

### Processing Flow
1. Message arrives via platform-specific channel
2. Platform adapter converts to standard format
3. Message enters inbound-messages queue with unique ID
4. Message processor handles based on type
5. For files, forwards to validation queue

## Validation Queue

### Purpose
- Upload files to OpenAI for processing
- Manage user interaction workflow
- Track validation state

### Pause/Resume Pattern
- **Initial Processing**: Upload file to OpenAI, pause job
- **User Interaction**: Job remains paused while awaiting user response
- **Job State Persistence**: Paused state maintains across system restarts
- **Completion**: Resume job after user validation, complete processing

### Job States
1. **Active**: Initial processing (uploading to OpenAI)
2. **Paused**: Awaiting user validation
3. **Resumed**: Processing user validation input
4. **Completed**: Validation finished
5. **Failed**: Error occurred during processing

### Processing Flow
1. Job enters validation queue
2. Processor uploads file to OpenAI
3. File ID and metadata stored in job data
4. Job paused, notification sent to user via original platform
5. User responds with validation input
6. System matches response to paused job
7. Job resumed with user input
8. Validation completed based on user input

### Error Handling
- **Upload failures**: Retry with backoff or fail permanently after max attempts
- **Timeout handling**: Optional timeout for validation responses (configurable)
- **Invalid responses**: Request clarification from user

## System Benefits

- **Unified processing**: Consistent handling regardless of source
- **Extensibility**: Easy to add new input sources
- **Resilience**: Paused jobs persist across system restarts
- **Monitoring**: Full visibility of message flow and validation states
- **User experience**: Natural interaction within user's preferred platform

## Implementation Considerations

- **Bull queue configuration**: Separate queues for inbound messages and validation
- **Redis persistence**: Ensures job data survives restarts
- **Concurrency**: Multiple workers for inbound messages, single worker for validation
- **Logging**: Structured logging to track message journey