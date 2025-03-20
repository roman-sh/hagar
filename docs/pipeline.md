*Tasks patiently wait  
Redis holds what time forgot  
Jobs flow like water*

# Document Processing Pipeline Architecture

## Overview

This document outlines a message queue-based pipeline architecture for processing document scans. The system uses [Bull](https://github.com/OptimalBits/bull) with Redis to create a series of queues that move documents through various processing stages, from initial upload to final analysis.

## Architecture Diagram

```
┌────────────┐   ┌─────────────────┐   ┌──────────────┐   ┌────────────────┐   ┌─────────────┐
│            │   │                 │   │              │   │                │   │             │
│ CouchDB    │──→│ scan_approval   │──→│  User        │──→│ ocr_analysis   │──→│ data        │──→ ...
│ Change Feed│   │ Queue           │   │  Approval    │   │ Queue          │   │ extraction  │
│            │   │                 │   │              │   │                │   │ Queue       │
└────────────┘   └─────────────────┘   └──────────────┘   └────────────────┘   └─────────────┘
```

## Bull Queue Implementation

We'll use the Bull queue library with Redis for our pipeline:

```javascript
const Queue = require('bull');

// Create separate queues for each stage
const scanApprovalQueue = new Queue('scan-approval', {
  redis: { port: 6379, host: '127.0.0.1' }
});

const ocrQueue = new Queue('ocr-processing', {
  redis: { port: 6379, host: '127.0.0.1' }
});

const dataExtractionQueue = new Queue('data-extraction', {
  redis: { port: 6379, host: '127.0.0.1' }
});
```

## Flow Description

1. **Initial Detection**: 
   - CouchDB change feed detects new documents with status "received"
   - Places document reference in the first queue (scan-approval)

2. **User Approval Stage**:
   - Processor for scan-approval queue prepares document for user review
   - User approves or rejects the document
   - If approved, document placed in ocr-processing queue
   - If rejected, status set to "rejected" (end of flow)

3. **OCR Analysis Stage**:
   - Processor for ocr-processing queue performs OCR on the document
   - Updates document with OCR results
   - Places document in data-extraction queue

4. **Additional Stages**:
   - Data extraction
   - Validation
   - Classification
   - Integration with other systems

## Benefits of Bull Queue Implementation

1. **Robust Job Management**:
   - Persistence of jobs in Redis
   - Automatic retries with configurable backoff
   - Job priority support
   - Delayed job processing

2. **Monitoring and Observability**:
   - Built-in events for job lifecycle
   - Bull Board UI for visual monitoring
   - Queue statistics and metrics

3. **Error Handling**:
   - Configurable retry mechanisms
   - Stalled job detection
   - Failed job tracking

4. **Performance**:
   - Efficient processing with Redis backend
   - Configurable concurrency per queue
   - Rate limiting capabilities

## Implementation Example

### Setting Up Queues

```javascript
const Queue = require('bull');

// Redis connection config (can be shared)
const redisConfig = {
  redis: {
    port: 6379,
    host: '127.0.0.1',
    // Optional password
    // password: 'redis-password'
  }
};

// Create queues
const scanApprovalQueue = new Queue('scan-approval', redisConfig);
const ocrQueue = new Queue('ocr-processing', redisConfig);
const dataExtractionQueue = new Queue('data-extraction', redisConfig);
```

### Monitoring with Bull Board

```javascript
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { FastifyAdapter } = require('@bull-board/fastify');
const fastify = require('fastify');

const app = fastify();

// Create a Fastify adapter
const serverAdapter = new FastifyAdapter();

// Create Bull Board
createBullBoard({
  queues: [
    new BullAdapter(scanApprovalQueue),
    new BullAdapter(ocrQueue),
    new BullAdapter(dataExtractionQueue)
  ],
  serverAdapter
});

// Add the Bull Board routes to your Fastify app
serverAdapter.setBasePath('/admin/queues');
app.register(serverAdapter.registerPlugin());

// Start the server
app.listen({ port: 3000 }, () => {
  console.log('Bull Board running on http://localhost:3000/admin/queues');
});
```

### CouchDB Change Feed Listener

```javascript
// Listen for CouchDB changes
db.changes({
  since: 'now',
  include_docs: true,
  live: true
}).on('change', async (change) => {
  if (change.doc?.status === 'received') {
    // Add document to first queue with retry configuration
    await scanApprovalQueue.add(
      { docId: change.id },
      { 
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    );
    
    console.log(`Document ${change.id} added to scan approval queue`);
  }
});
```

### Queue Processors

```javascript
// Scan Approval Queue Processor
scanApprovalQueue.process(async (job) => {
  const { docId } = job.data;
  const doc = await db.get(docId);
  
  // Update document status
  await db.insert({
    ...doc,
    status: 'awaiting_approval',
    updatedAt: new Date().toISOString()
  });
  
  // Notify UI for approval (implementation depends on your UI system)
  await notifyUIForApproval(docId);
  
  return { status: 'awaiting_approval' };
});

// OCR Queue Processor
ocrQueue.process(async (job) => {
  const { docId } = job.data;
  const doc = await db.get(docId);
  
  // Update status to show OCR is in progress
  await db.insert({
    ...doc,
    status: 'ocr_processing',
    updatedAt: new Date().toISOString()
  });
  
  try {
    // Get attachment content for OCR
    const attachment = await db.attachment.get(docId, 'content');
    
    // Perform OCR (implementation depends on your OCR service)
    const ocrResults = await performOcr(attachment);
    
    // Update document with OCR results
    await db.insert({
      ...doc,
      status: 'ocr_completed',
      ocrResults,
      updatedAt: new Date().toISOString()
    });
    
    // Add to next queue for data extraction
    await dataExtractionQueue.add({ docId });
    
    return { status: 'ocr_completed' };
  } catch (error) {
    // Log error
    console.error(`OCR processing error for ${docId}:`, error);
    
    // Update document with error info
    await db.insert({
      ...doc,
      status: 'ocr_error',
      error: {
        message: error.message,
        occurredAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    });
    
    // Rethrow to trigger Bull's retry mechanism
    throw error;
  }
});

// Data Extraction Queue Processor
dataExtractionQueue.process(async (job) => {
  const { docId } = job.data;
  // Similar pattern to OCR processing
  // ...
});
```

### User Approval Handler

```javascript
// Function called from UI when user approves document
async function approveDocument(docId, isApproved, userId) {
  const doc = await db.get(docId);
  
  if (isApproved) {
    // Update document as approved
    await db.insert({
      ...doc,
      status: 'approved',
      approvedBy: userId,
      approvedAt: new Date().toISOString()
    });
    
    // Add to OCR queue
    await ocrQueue.add(
      { docId },
      { 
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
    
    return { success: true, status: 'approved' };
  } else {
    // Handle rejection
    await db.insert({
      ...doc,
      status: 'rejected',
      rejectedBy: userId,
      rejectedAt: new Date().toISOString()
    });
    
    return { success: true, status: 'rejected' };
  }
}
```

## Error Handling

Bull provides several mechanisms for error handling:

1. **Automatic retries**:
   ```javascript
   // Configure retry with exponential backoff
   queue.add(data, {
     attempts: 5,
     backoff: {
       type: 'exponential',
       delay: 1000
     }
   });
   ```

2. **Failed job events**:
   ```javascript
   queue.on('failed', (job, err) => {
     console.error(`Job ${job.id} failed with error: ${err.message}`);
     
     // Move to error handling if max attempts reached
     if (job.attemptsMade >= job.opts.attempts) {
       handlePermanentFailure(job.data.docId, err);
     }
   });
   ```

3. **Stalled job detection**:
   ```javascript
   queue.on('stalled', (job) => {
     console.warn(`Job ${job.id} has stalled`);
   });
   ```

## Monitoring and Management

1. **Queue events**:
   ```javascript
   queue.on('completed', (job, result) => {
     console.log(`Job ${job.id} completed with result:`, result);
   });
   
   queue.on('active', (job) => {
     console.log(`Job ${job.id} has started processing`);
   });
   ```

2. **Queue cleanup**:
   ```javascript
   // Clean completed jobs older than 1 hour
   await queue.clean(3600000, 'completed');
   
   // Clean failed jobs older than 24 hours
   await queue.clean(86400000, 'failed');
   ```

3. **Queue metrics**:
   ```javascript
   const jobCounts = await queue.getJobCounts();
   console.log(`
     Waiting: ${jobCounts.waiting}
     Active: ${jobCounts.active}
     Completed: ${jobCounts.completed}
     Failed: ${jobCounts.failed}
   `);
   ```

## Conclusion

This Bull-based queue architecture provides a robust, scalable, and maintainable approach for document processing workflows. Each stage of processing has its own dedicated queue with appropriate error handling, monitoring, and configuration. The use of Redis as a backend ensures persistence and reliability of jobs throughout the pipeline. 

## Queue-Based Document Tracking

To maintain complete visibility and control over document state, we implement a "documents always in queue" approach. This ensures no document is ever "floating" in the database without being tracked in a corresponding queue.

### Dedicated Approval Waiting Queue

```javascript
// Create a queue specifically for tracking documents awaiting approval
const waitingApprovalQueue = new Queue('waiting-approval', redisConfig);

// This queue doesn't need a processor as it's used for tracking only
```

### Workflow Implementation

1. **Adding to Waiting Queue**:
   ```javascript
   // After initial scan processing, add to waiting queue
   // Use document ID as the job name for easy reference
   await waitingApprovalQueue.add(doc._id, {
     docId: doc._id,
     storeId: doc.storeId,
     addedAt: new Date().toISOString()
   });
   ```

2. **Approval Handling**:
   ```javascript
   async function handleApproval(docId, isApproved) {
     // Remove from waiting queue using document ID as job name
     await waitingApprovalQueue.removeJobs(docId);
     
     if (isApproved) {
       // Add to next processing queue
       await ocrQueue.add({ docId });
     } else {
       // Update as rejected in database
       const doc = await db.get(docId);
       await db.insert({
         ...doc,
         status: 'rejected',
         updatedAt: new Date().toISOString()
       });
     }
   }
   ```

### Benefits of Queue-Based Tracking

1. **Complete Visibility**: Every document's state is reflected in both the database and a corresponding queue
2. **Better Monitoring**: Track documents waiting for approval, including count and wait times
3. **Stale Detection**: Easily identify documents waiting too long for approval
4. **Automated Reminders**: Use queue events to trigger reminders after threshold wait times
   ```javascript
   // Set up reminders for documents waiting too long
   waitingApprovalQueue.on('stalled', (job) => {
     sendApprovalReminder(job.data.storeId, job.data.docId);
   });
   ```
5. **Consistent Architecture**: Maintains the queue-based processing model throughout the entire pipeline

### Monitoring Waiting Documents

The waiting queue can be monitored through Bull Board alongside other queues, providing operators with a complete view of all documents in the system, including those awaiting human intervention.

```javascript
// Add the waiting queue to Bull Board
createBullBoard({
  queues: [
    new BullAdapter(scanApprovalQueue),
    new BullAdapter(waitingApprovalQueue), // Approval waiting queue
    new BullAdapter(ocrQueue),
    new BullAdapter(dataExtractionQueue)
  ],
  serverAdapter
});
```

By using named jobs that match your document IDs, you maintain a direct reference between queue jobs and database documents without needing to store additional job IDs in your documents. 