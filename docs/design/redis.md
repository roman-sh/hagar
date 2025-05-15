# Redis Configuration for Document Processing Pipeline

## Overview

This document outlines our Redis configuration for the document processing pipeline. Redis serves two critical functions in our architecture:

1. **Bull Queue Backend**: Powers our job processing pipeline
2. **Vector Database**: Stores product catalog embeddings for semantic search

## Redis Persistence Configuration

Since Redis holds both our job queues and vector embeddings, proper persistence configuration is essential to prevent data loss during restarts.

### Persistence Strategy: Append-Only File (AOF)

We use AOF persistence for its balance of data safety and performance. Add the following to your `redis.conf` file:

```conf
# Redis AOF Configuration
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec  # Sync every second
```

### Persistence Configuration Explained

- **`appendonly yes`**: Enables the AOF persistence mechanism
- **`appendfilename "appendonly.aof"`**: Sets the name of the AOF file
- **`appendfsync everysec`**: Syncs the AOF to disk once per second

This configuration ensures:
- Every Redis command is first written to an in-memory buffer
- The buffer is flushed to disk once per second
- Maximum potential data loss is limited to 1 second of operations
- Minimal performance impact compared to syncing after every operation

### Setting Up Redis with Persistence

1. **Edit Redis Configuration File**:
   ```bash
   # Location may vary based on your installation
   sudo nano /etc/redis/redis.conf
   ```

2. **Update the Persistence Settings** as shown above

3. **Restart Redis Service**:
   ```bash
   sudo systemctl restart redis
   # or
   sudo service redis restart
   ```

4. **Verify AOF is Enabled**:
   ```bash
   redis-cli config get appendonly
   ```

## Bull Queue Configuration

Our Bull queue configuration leverages Redis for reliable job processing:

```javascript
import Queue from 'bull';

// Redis connection config
const redisConfig = {
  redis: {
    port: 6379,
    host: process.env.REDIS_HOST || 'localhost',
    password: process.env.REDIS_PASSWORD,
    db: 0  // Use database 0 for Bull queues
  }
};

// Create queues
const scanApprovalQueue = new Queue('scan-approval', redisConfig);
const ocrQueue = new Queue('ocr-processing', redisConfig);
const dataExtractionQueue = new Queue('data-extraction', redisConfig);
const productMatchingQueue = new Queue('product-matching', redisConfig);
```

### Queue Configuration Options

For each Bull queue, we configure:

```javascript
// Default job options
const defaultJobOptions = {
  attempts: 3,                 // Retry failed jobs 3 times
  backoff: {                   // Exponential backoff strategy
    type: 'exponential',
    delay: 1000                // Starting with 1s delay
  },
  removeOnComplete: 100,       // Keep last 100 completed jobs
  removeOnFail: 100            // Keep last 100 failed jobs
};

// Create queue with options
const ocrQueue = new Queue('ocr-processing', {
  redis: redisConfig.redis,
  defaultJobOptions
});
```

## Redis Vector Store Configuration

We use Redis for storing and searching vector embeddings:

```javascript
import { Client } from 'redis';
import { RedisVectorStore } from 'langchain/vectorstores/redis';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';

// Connect to Redis (reusing the same Redis instance as Bull)
const redisClient = new Client({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379
  },
  password: process.env.REDIS_PASSWORD,
  database: 1  // Use database 1 for vector storage
});
await redisClient.connect();

// Create vector store
const vectorStore = await RedisVectorStore.fromTexts(
  catalogItems.map(item => `${item.product.name} ${item.fullName} ${item.secondaryName || ''}`),
  catalogItems.map(item => ({ id: item.nonObfuscatedId })),
  new OpenAIEmbeddings(),
  {
    redisClient,
    indexName: 'product-catalog-index',
    keyPrefix: 'product:'  // Prefix for Redis keys
  }
);
```

### Vector Store Configuration Options

- **`indexName`**: Name of the vector index in Redis
- **`keyPrefix`**: Prefix for all keys in the vector store
- **Using Database 1**: We separate vector data from Bull queue data by using a different Redis database number

## Redis Memory Management

To optimize Redis memory usage, we implement:

1. **Key Expiration for Completed Jobs**:
   - Completed jobs are removed after a configurable threshold
   - Helps prevent Redis memory growth over time

2. **Memory Monitoring**:
   - Regular monitoring of Redis memory usage
   - Alert thresholds for high memory usage

3. **Job Data Size Limits**:
   - Avoid storing large binary data in job payloads
   - Store file references rather than actual content

## Redis Monitoring and Management

### Monitoring Tools

1. **Redis-CLI Monitoring**:
   ```bash
   # Monitor all Redis commands in real-time
   redis-cli monitor
   
   # Watch memory usage
   watch -n 1 "redis-cli info | grep used_memory"
   ```

2. **Bull Board**: Monitoring UI for Bull queues
   ```javascript
   import { createBullBoard } from '@bull-board/api';
   import { BullAdapter } from '@bull-board/api/bullAdapter';
   import { FastifyAdapter } from '@bull-board/fastify';

   // Create Bull Board
   const serverAdapter = new FastifyAdapter();
   createBullBoard({
     queues: [
       new BullAdapter(scanApprovalQueue),
       new BullAdapter(ocrQueue),
       new BullAdapter(dataExtractionQueue),
       new BullAdapter(productMatchingQueue)
     ],
     serverAdapter
   });

   // Add to Fastify
   app.register(serverAdapter.registerPlugin());
   ```

### Key Redis Commands for Management

```bash
# Connect to Redis CLI
redis-cli

# Monitor memory usage
INFO memory

# List keys by pattern
KEYS bull:scan-approval:*

# Check queue size
LLEN bull:scan-approval:wait

# View all vector indices
FT._LIST

# Manually trigger AOF persistence
BGREWRITEAOF
```

## Conclusion

This Redis configuration provides a robust foundation for our document processing pipeline. Using AOF persistence with a one-second sync interval balances data safety with performance, ensuring our Bull queues and vector embeddings remain intact across system restarts while maintaining good performance. 