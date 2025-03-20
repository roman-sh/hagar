# Hagar™ Delivery Invoice Processing System Design

## Overview

This document outlines the design choices for processing Hebrew delivery invoices using Azure Document Intelligence (formerly Form Recognizer) and post-processing techniques. The system aims to accurately extract and validate information from delivery invoices while handling the complexities of Hebrew text and tabular data. The primary purpose of this system is to manage inventory by automating the detection, extraction, and processing of product information from shipping documents.

## System at a Glance

The Hagar™ system is designed to automate inventory management through digitization and intelligent processing of shipping documents. The system works as follows:

1. **Document Ingestion**: Store managers scan delivery invoices using a provided compact scanner.
2. **Automated Processing**: The system uses Azure Document Intelligence with the prebuilt invoice model to extract relevant information from Hebrew documents.
3. **Human-in-the-Loop Validation**: Extracted information is presented to store managers via WhatsApp for verification and correction if needed.
4. **Inventory Integration**: Once approved, the data automatically updates the store's inventory system.
5. **Comprehensive Tracking**: All updates are logged and tracked, with full visibility through a dedicated Gmail account.

Key distinguishing features include:
- Hebrew language optimization
- WhatsApp-based user interface requiring minimal training
- High-resolution OCR processing
- Seamless integration with existing workflows
- No changes required to supplier documentation

The system dramatically reduces manual data entry, minimizes errors, and provides real-time inventory updates while maintaining human oversight of the process.

## Architecture Components

### 1. Document Analysis (Azure Document Intelligence)
- Uses Azure Document Intelligence (prebuilt-invoice model) for information extraction
- Processes the document with high-resolution OCR for better quality
- Extracts structured data including tables, fields, and text content
- Supports Hebrew language processing with proper locale settings

### 2. Data Extraction
- Extracts key fields from the analysis results (invoice ID, vendor name, date)
- Processes table data to extract structured item information
- Applies text cleanup to improve quality and readability

### 3. Text Cleanup Process
- Replaces newlines with spaces for consistent formatting
- Removes OCR artifacts like selection marks
- Normalizes spacing by reducing multiple spaces to single spaces
- Replaces double quotes with proper Hebrew gershaim (״)
- Trims leading and trailing spaces for cleaner output

### 4. Post-Processing
- Cleanup of OCR artifacts
- Date formatting for consistency
- Items organization into structured tables

## Data Flow

1. **Input**: Hebrew delivery invoice image/PDF
2. **Azure Processing**: Extract structured information with high-resolution OCR
3. **Data Extraction**: Extract key fields and table data
4. **Text Cleanup**: Clean and normalize text content
5. **Data Structuring**: Organize data into standardized JSON format
6. **Output**: Structured data ready for validation and inventory integration

## Current Implementation

### 1. Document Analysis
- Submits documents to Azure Document Intelligence using the prebuilt invoice model
- Specifies Hebrew locale for better text recognition
- Enables high-resolution OCR for improved quality and fewer artifacts

### 2. Data Extraction
- Extracts basic invoice information including ID, vendor name, and date
- Applies text cleanup to improve readability
- Formats dates consistently for standardization

### 3. Table Extraction
- Processes table cells from the analysis result
- Groups cells into rows based on the table's column count
- Creates a structured 2D array representation of the table
- Applies text cleanup to all cell content

## Technical Requirements

- Node.js environment
- Azure Document Intelligence API access
- Storage for document images and processed data

## Inventory Integration

### Document Structure
Inventory updates use the following document structure:

```json
{
  "invoiceId": "452504233",
  "vendorName": "שדות תוצרת אורגנית",
  "invoiceDate": "2025-02-26",
  "items": [
    ["קוד פריט", "ברקוד", "תיאור", "כמות", "מחיר"],
    ["8250500", "7290011444037", "ביצי חופש אורגניות", "20.00", "30.00"],
    ["8230527", "7290015417563", "בזיליקום אורגני בנספק", "10.00", "12.50"]
  ]
}
```

The document structure includes:
- Basic invoice details (ID, vendor, date)
- Items represented as a 2D array with headers in the first row
- Clean, normalized text for better readability

## User Interaction Workflow

### Document Acquisition
1. **Scanning Process**:
   - Store manager scans delivery invoice using Epson DS-80W scanner
   - Scanner outputs PDF file of the document
   - PDF is automatically sent to dedicated email address via scanner's direct cloud integration

2. **Document Retrieval**:
   - System uses a combination of Gmail, Cloudmailin, and IMAP for efficient document processing:
     
     - **Gmail Account Setup**
       - Each store has a dedicated Gmail account
       - ScanSnap ix100 scanner configured to send PDFs directly to this email
       - Provides familiar interface for store managers to review documents
       - Enables long-term storage and search capabilities
     
     - **Cloudmailin Integration**
       - Gmail configured to forward all incoming emails to Cloudmailin address
       - Cloudmailin immediately sends webhook notification to application
       - Application receives PDF attachment and email metadata
       - Simple HTTP POST webhook requires minimal setup
       - Real-time processing with no polling delays
     
     - **IMAP Management**
       - Application connects to Gmail via IMAP after processing
       - Moves emails to appropriate folders based on processing status:
         - "Processed" folder for successfully handled documents
         - "Failed" folder for documents with errors
       - Provides visual feedback in Gmail interface
       - No complex OAuth or Google Cloud setup required
     
     - **System Startup Recovery**
       - On application startup, system performs inbox reconciliation:
         - Connects to Gmail via IMAP
         - Retrieves all unprocessed emails (those still in Inbox folder)
         - Processes emails in chronological order (oldest first)
         - Identifies and handles emails that were sent while system was down
         - Cross-references with processing history to prevent duplicates
         - Updates notification time in database to track processing delays
       - Maximum lookback period configurable (default: 7 days)
       - Logs startup recovery statistics (found/processed counts)
       - Prioritizes historical processing before accepting new webhooks
     
   - Benefits:
     - Real-time processing (typically <2 seconds from receipt)
     - Simple implementation with minimal external dependencies
     - No recurring service costs (Cloudmailin free tier sufficient for testing)
     - Full visibility of document status in Gmail interface

### User Confirmation & Communication
1. **Initial Notification**:
   - System sends WhatsApp message to manager when new scan is received
   - Message includes: timestamp, document preview (thumbnail), and confirmation request
   - Example: "Received delivery invoice at 14:30, please confirm to proceed with processing"

2. **Processing Confirmation**:
   - Manager reviews document preview
   - Confirms via WhatsApp with "Confirm" or "Cancel" button
   - System only begins processing after explicit confirmation

3. **Error Resolution**:
   - For unresolvable errors, system initiates WhatsApp conversation
   - System generates contextual questions about problematic fields
   - User responds with corrections directly in chat
   - Example dialog:
     - System: "Unable to read quantity for product ABC123 (מוצר כחול). The image shows '5?' but detected '57'. What is the correct quantity?"
     - User: "It's 5"
     - System: "Thank you, updated to 5 units. Processing will continue..."

### Process Completion
1. **Success Notification**:
   - System sends confirmation when inventory update is complete
   - Includes summary of items processed
   - Example: "Successfully updated inventory with 12 items from delivery invoice TD-12345"

2. **Processing Failure**:
   - If any item cannot be processed despite error resolution attempts
   - System aborts the entire delivery invoice processing
   - No partial updates are sent to inventory system
   - Example: "Processing of delivery invoice TD-12345 has been aborted. 2 items could not be processed. Please check the items and rescan or manually enter the invoice."
