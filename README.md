# Hagar Delivery

AI-powered inventory management system that automates the processing of delivery invoices through intelligent document processing.

## Overview

Hagar is a specialized system designed to streamline inventory management for stores by automating the detection, extraction, and processing of product information from delivery invoices. The system uses advanced technologies like Azure Document Intelligence, vector-based semantic search, and natural language processing to accurately extract and validate information from Hebrew invoices.

## Core Features

- **Document Ingestion**: Stores scan delivery invoices using a compact scanner (Epson DS-80W)
- **Hebrew OCR Processing**: Uses Azure Document Intelligence to extract information from Hebrew documents
- **WhatsApp Integration**: Store managers receive notifications and verify extracted information via WhatsApp
- **Automatic Inventory Updates**: Once verified, the system updates the store's inventory system automatically
- **Vector-Based Product Matching**: Accurately matches invoice items to store catalog using semantic search
- **Document Processing Pipeline**: Robust queue-based architecture for reliable document processing

## Technical Architecture

### Document Processing Pipeline

The system uses a queue-based processing pipeline powered by Bull and Redis to handle document processing:

```
┌────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────┐
│            │   │                 │   │              │   │                │   │             │
│ CouchDB    │──→│ scan_approval   │──→│  User        │──→│ ocr_analysis   │──→│ data        │──→ ...
│ Change Feed│   │ Queue           │   │  Approval    │   │ Queue          │   │ extraction  │
│            │   │                 │   │              │   │                │   │ Queue       │
└────────────┘   └─────────────────┘   └──────────────┘   └────────────────┘   └─────────────┘
```

- **Redis-Based Queue**: Powers the job processing pipeline with persistence across restarts
- **User Approval Workflow**: Integrates human verification for critical steps
- **Monitoring & Error Handling**: Robust error recovery and monitoring through Bull Board UI

### Product Matching System

For matching invoice items to catalog products, the system uses:

- **Vector Embeddings**: Stores and searches product descriptions as semantic embeddings in Redis
- **Two-Stage Matching**: Combines vector similarity search with LLM-based verification
- **Human Verification**: Presents options for medium-confidence matches to store managers for selection

### User Interface

- **WhatsApp-Based UI**: Requires minimal training for store managers
- **Gmail Integration**: All document updates are logged with full visibility through a dedicated Gmail account
- **Minimal Changes to Workflow**: Seamlessly integrates with existing store operations

## Technologies Used

- **Node.js**: Core application platform
- **Azure Document Intelligence**: For OCR and document analysis
- **Redis**: Powers both the job queue system and vector search capabilities
- **Bull**: Queue management for document processing pipeline
- **WhatsApp Web.js**: For WhatsApp integration
- **CouchDB**: For document and data storage
- **OpenAI**: For embeddings and LLM-based verification

## Installation

```bash
# Clone the repository
git clone https://github.com/username/hagar-delivery.git
cd hagar-delivery

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start the application
npm start
```

## Environment Configuration

Create a `.env` file with the following variables:

```
# Azure Document Intelligence
AZURE_FORM_RECOGNIZER_ENDPOINT=your_endpoint
AZURE_FORM_RECOGNIZER_KEY=your_key

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# CouchDB
DB_CONNECTION_STRING=your_database_connection_string

# OpenAI
OPENAI_API_KEY=your_openai_key

# Email Configuration
EMAIL_USER=your_email
EMAIL_PASSWORD=your_email_password
```

## Documentation

Additional documentation can be found in the `docs/` directory:

- `pipeline.md`: Details on the document processing pipeline
- `redis.md`: Redis configuration for queues and vector storage
- `search.md`: Product matching system implementation
- `design.md`: System design choices and architecture
- `update.md`: Process for updating products in the catalog system

## License

[License information]

## Contact

[Contact information] 