# PDF Validation Flow Design

## Overview

This document outlines the design of our PDF validation flow that enables long-running validation processes that require user interaction.

## Challenges with Long-Running Interactive Jobs

PDF validation involves several steps:
1. Initial document upload and storage
2. Submission to OpenAI for analysis
3. **User interaction period (may be minutes, hours, or days)**
4. Final processing based on validation results

Step 3 presents a challenge with most job queue systems. Jobs that wait for user interaction need to:
- Maintain their state between system restarts
- Not be marked as stalled/failed during potentially long waiting periods
- Enable monitoring of what stage each document is in

## Implementation Approach

We've implemented a design that allows for long-running validation jobs using Bull's queue system:

### 1. Extended Stalled Interval

Using Bull's `stalledInterval` setting (set to 7 days), we allow jobs to remain active for up to a week while awaiting user interaction:

```typescript
const pipelineQueueConfig: QueueOptions = {
   settings: {
      stalledInterval: 7 * 24 * 60 * 60 * 1000, // 7 days - allows for long user interaction periods
   }
}
```

### 2. Job Progress Reporting

Instead of trying to pause individual jobs (which Bull doesn't support), we:
- Use Bull's built-in progress reporting to track the validation state
- Complete the job once the initial validation preparation is done
- Use the progress events for monitoring

```typescript
// Report progress to indicate waiting for user validation
const progressData = {
   stage: 'awaiting_user_validation',
   startedAt: Date.now(),
   messageId
};
job.progress(progressData);
```

This approach is better than trying to update the job data because:
- It uses Bull's native progress tracking mechanism
- It emits 'progress' events that can be listened to
- It's specifically designed for state/progress tracking

### 3. Cross-Queue Communication

We separate concerns by:
- Using the scan-validation queue for initial document processing
- Using the inbound-messages queue to handle the communication with users

This creates a clean separation of responsibilities while maintaining monitoring visibility.

## Workflow

1. **Document Creation**:
   - PDF is uploaded and stored in S3
   - Document metadata is stored in MongoDB
   - Job is added to scan-validation queue

2. **Initial Validation**:
   - scan-validation processor retrieves document from MongoDB
   - Creates a message in inbound-messages queue for user interaction
   - Reports progress as "awaiting_user_validation"
   - Completes successfully

3. **User Interaction**:
   - User interacts with the document via inbound-messages queue
   - When validation is complete, the status in MongoDB is updated
   - The document proceeds to the next queue in the pipeline

## Monitoring Benefits

This approach enables clear monitoring of document status:
- Each document appears in the appropriate queue for its current stage
- Progress events can be monitored to track validation status
- The time spent in each stage is tracked and visible
- Document history is preserved for auditing purposes

## Considerations

- **Re-runs**: If a job needs to be re-run, it can be manually re-queued
- **Timeouts**: Documents that aren't validated after a long period can be handled by a separate cleanup process
- **System restarts**: The approach is resilient to system restarts as all state is stored in Redis and MongoDB 