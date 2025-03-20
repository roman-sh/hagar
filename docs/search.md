# Product Search Implementation: Invoice-to-Catalog Matching

## Overview

This document outlines the implementation of our semantic search system for accurately matching product descriptions from invoices to corresponding items in our product catalog. The system uses a two-stage approach combining vector embeddings with LLM-based verification to achieve high accuracy matching.

## Challenges

Our product matching system addresses several key challenges:

1. **Text Variation**: Invoice descriptions often differ from catalog entries (different word order, additional/fewer words)
2. **Language Variations**: Different forms of the same words may be used (e.g., "ביצי" vs "ביצים")
3. **Critical Accuracy**: Updating a wrong item would render the system useless
4. **Scale**: The catalog contains approximately 1,000 items

## Redis-Based Vector Search

### Vector Search Implementation

We use Redis Vector Search for our embedding-based similarity search, leveraging our existing Redis infrastructure that also powers our Bull job queue system:

- **Unified Infrastructure**: Same Redis instance handles both job queues and vector search
- **Persistence**: Embeddings survive application restarts
- **Efficient Search**: Redis Vector Search uses HNSW algorithm (similar to FAISS) for fast nearest neighbor search
- **Metadata Filtering**: Ability to combine vector similarity with metadata filters

### Advantages Over Traditional Methods

Traditional approaches like regex or fuzzy matching focus on character-level similarities, which often fail to capture semantic meaning. Our embedding-based approach offers:

- **Semantic Understanding**: Captures the meaning of product descriptions, not just lexical similarity
- **Language Flexibility**: Works well with Hebrew product names and mixed Hebrew/English text
- **Variation Tolerance**: Handles rearranged words, additional descriptors, and different word forms
- **Confidence Scoring**: Provides quantifiable similarity measures for verification

### Implementation with LangChain.js and Redis

We use LangChain.js with its Redis vector store integration because it:

1. Simplifies the embedding process
2. Provides efficient vector storage and retrieval through Redis
3. Supports multiple embedding models
4. Offers excellent integration with JavaScript/TypeScript environments
5. Integrates seamlessly with our existing Redis infrastructure

## Two-Stage Search Process

Our system employs a two-stage search process to maximize accuracy:

### Stage 1: Initial Candidate Selection

1. **Exact Identifier Matching**: First attempt to match by UPC code or product ID if available
2. **Embedding Similarity Search**: For items without exact identifier matches:
   - Convert invoice item description to embedding vector
   - Compute similarity with all catalog item embeddings using Redis Vector Search
   - Select top N candidates (typically 5) that exceed minimum similarity threshold

### Stage 2: LLM-Based Verification

1. **LLM Analysis**: Feed the top candidates from Stage 1 to an LLM to determine the best match:
   - Provide the LLM with the invoice item description and details of top candidates
   - LLM performs contextual analysis and reasoning to identify the most likely match
   - LLM can understand semantic nuances and product relationships that vector similarity alone might miss
2. **Confidence Classification**:
   - High confidence: LLM is certain about the match
   - Medium confidence: LLM identifies possible matches but requires human verification
   - Low confidence: LLM cannot confidently identify a match, flag for manual processing
3. **Human Verification**: For medium-confidence matches, present LLM reasoning and options to the user for selection

## Implementation Details

### Redis Vector Store Setup

We create our vector store using LangChain.js's Redis integration:

```javascript
import { Client } from 'redis';
import { RedisVectorStore } from 'langchain/vectorstores/redis';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';

// Connect to Redis
const redisClient = new Client({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
await redisClient.connect();

// Create vector store
const vectorStore = await RedisVectorStore.fromTexts(
  catalogItems.map(item => `${item.product.name} ${item.fullName} ${item.secondaryName || ''}`),
  catalogItems.map(item => ({ id: item.nonObfuscatedId })),
  new OpenAIEmbeddings(),
  {
    redisClient,
    indexName: 'product-catalog-index'
  }
);
```

### Data Structure

For each catalog item, we store:

1. **In Vector Index** (Redis Vector Search):
   ```
   {
     pageContent: `${item.product.name} ${item.fullName} ${item.secondaryName || ''}`,
     metadata: {
       id: item.nonObfuscatedId
     }
   }
   ```
   - `pageContent` is converted to embedding vectors
   - `metadata` is stored alongside but not embedded
   - Only the ID is stored in metadata to keep storage efficient

2. **In Application Cache or Database**:
   - Complete catalog item information accessible by ID

### Similarity Search Implementation

```javascript
// Perform similarity search
const results = await vectorStore.similaritySearch(
  invoiceItemDescription,
  5 // Top 5 matches
);

// Results format: Array of documents with their pageContent and metadata
// [
//   { pageContent: "Product Name Full Description", metadata: { id: "product123" } },
//   ...
// ]
```

### LLM Integration

The LLM receives:
1. The original invoice item description
2. The top N candidate matches from vector search with their metadata
3. Instructions to evaluate the matches based on semantic similarity and context

The LLM returns:
1. The best match with confidence level
2. Explanation of reasoning for the match
3. Alternative matches if confidence is not high

### Verification System

For medium-confidence matches, we implement a verification interface that:
1. Shows the invoice item and potential catalog matches side by side
2. Displays the LLM's reasoning and confidence assessments
3. Allows easy selection of the correct match or flagging for manual processing

## Performance Considerations

- **Efficient Storage**: Redis Vector Search is optimized for vector similarity operations
- **Shared Infrastructure**: Using the same Redis instance for both Bull queues and vector search simplifies our architecture
- **Persistence**: Embeddings persist across application restarts
- **Update Strategies**: Catalog updates can be incrementally reflected in the vector store
- **Staged Processing**: Using vector search first reduces the data sent to the LLM, improving efficiency and reducing costs
- **Caching**: Frequently queried items can be cached at the application level to reduce Redis calls

## Integration with Processing Pipeline

The vector search functionality integrates with our Bull-based document processing pipeline:

1. The OCR stage extracts item descriptions from invoices
2. A dedicated product matching queue processes these descriptions
3. The product matching processor uses Redis Vector Search to find candidates
4. LLM verification confirms matches
5. Matched products are attached to the document in CouchDB

## Testing and Tuning

- **Test Suite**: Comprehensive test cases with known variations validate matching accuracy
- **LLM Prompt Tuning**: Refine the prompts sent to the LLM based on performance
- **Vector Index Configuration**: Tune Redis Vector Search parameters for optimal performance
- **Error Analysis**: Failed matches are analyzed to improve both embedding search and LLM verification

## Conclusion

The two-stage approach combining Redis-based vector search with LLM verification provides a robust solution for matching invoice items to catalog products. By leveraging our existing Redis infrastructure for both job queues and vector search, we achieve a more streamlined architecture with persistent embeddings and efficient search capabilities. 