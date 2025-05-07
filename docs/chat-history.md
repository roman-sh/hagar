# Chat History Management Approaches

This document outlines two approaches for managing conversation history in our document processing system.

## User-Centric Conversation Management

Our system uses a **User-Centric** approach where conversations are linked to users/phone numbers. This approach:
- Maintains context across multiple invoices in a session
- Enables continuous conversation flow
- Allows addressing issues that arise after processing

## System Architecture Note

Our MongoDB design follows this pattern:
- One database per system (inventory management system)
- Collections represent individual stores
- Documents of different types are mixed in a single collection with a "type" field to distinguish them
- Each document has a "type" field to distinguish its purpose

## Approach 1: Array in User Document

Store the entire conversation history as an array within the user's document, focusing solely on maintaining the conversation context.

### Advantages
- **Simplicity**: Complete conversation history available in a single document
- **Troubleshooting**: Easy to see the full context of a conversation
- **Query Efficiency**: Retrieve user and conversation in a single operation
- **Implementation Speed**: Straightforward to implement and maintain
- **Session Continuity**: Natural flow across multiple interactions

### Challenges
- **Document Size Limits**: MongoDB has a 16MB document size limit
- **Update Overhead**: Each new message requires rewriting the entire array
- **All-or-Nothing Access**: Always loads the complete conversation history

### Implementation Example
```javascript
// User document structure with embedded conversation
// (stored in the store's collection)
{
  _id: ObjectId("..."),
  type: "user",                  // Document type identifier
  phoneNumber: "+9721234567",
  role: "manager",
  // Simple conversation array with OpenAI message format
  conversation: [
    {
      role: "system",
      content: "You are assisting with invoice processing..."
    },
    {
      role: "user",
      content: [
        { type: "input_file", file_id: "file-abc123" },
        { type: "input_text", text: "Validate this invoice." }
      ]
    },
    {
      role: "assistant",
      content: "I've analyzed the invoice and found the following issues..."
    }
    // Additional messages without timestamps or document references
  ]
}

// Adding a message while limiting array size
// (database = inventory system, collection = store)
db.getCollection('tel_aviv_store').updateOne(
  { type: "user", phoneNumber: "+9721234567" },
  { 
    $push: { 
      conversation: { 
        $each: [newMessage],
        $slice: -100  // Keep only most recent 100 messages
      } 
    }
  }
);
```

## Approach 2: Separate Message Documents

Store each message as a separate document in the same store collection.

### Advantages
- **Scalability**: No document size limits for conversation length
- **Flexible Retrieval**: Can fetch by time range or filter by content
- **Efficient Updates**: Only create new documents, no rewriting existing data
- **Auto-Expiry**: Can set TTL indexes to automatically delete old messages
- **Independent Storage**: Each message can be managed separately

### Challenges
- **Implementation Complexity**: Requires additional queries and aggregation
- **Order Management**: Must ensure proper timestamp-based sorting
- **Higher Query Count**: May require multiple database operations

### Implementation Example
```javascript
// Message document structure - simplified
// (stored in the store's collection)
{
  _id: ObjectId("..."),
  type: "message",               // Document type identifier
  phoneNumber: "+9721234567",    // Primary identifier for grouping
  role: "assistant",
  content: "I've validated the invoice and found the following issues...",
  timestamp: ISODate("2023-07-20T14:33:20Z") // For ordering messages
}

// Retrieving user's full conversation history
db.getCollection('tel_aviv_store').find(
  { type: "message", phoneNumber: "+9721234567" },
  { sort: { timestamp: 1 } }
);

// Setting up TTL index for auto-deletion after 30 days
// Note: TTL indexes should be set up on each store collection
db.getCollection('tel_aviv_store').createIndex(
  { timestamp: 1 },
  { partialFilterExpression: { type: "message" }, // Only apply to message documents
    expireAfterSeconds: 2592000 } // 30 days
);
```

## Implementation Considerations

For optimal conversation management:

1. **Message Retention Policy**
   - For array approach: Implement sliding window with $slice
   - For separate documents: Use TTL indexes with partial filter expressions for automatic cleanup

2. **Context Cleanup**
   - Periodically clean up old conversations to prevent document growth
   - Consider archiving completed conversations

## MongoDB UI Troubleshooting

For debugging user conversations:

### Compass Aggregation Pipeline
```javascript
[
  { $match: { type: "message", phoneNumber: "+9721234567" } },
  { $sort: { timestamp: 1 } },
  { $project: {
      _id: 0,
      timestamp: 1,
      role: 1,
      content: 1
    }
  }
]
```

### Creating a User Conversation View
```javascript
// Create a view for a specific store
db.createView(
  "user_conversations",
  "tel_aviv_store",  // Source collection (store)
  [
    { $match: { type: "message" } },
    { $sort: { timestamp: 1 } },
    { $group: {
        _id: "$phoneNumber",
        messages: { $push: "$$ROOT" },
        messageCount: { $sum: 1 },
        firstMessage: { $first: "$timestamp" },
        lastMessage: { $last: "$timestamp" }
      }
    }
  ]
)
```

## Conclusion

After evaluating both approaches, we've chosen to implement the **Separate Message Documents** approach for our system. This choice offers several key advantages:

1. **Automatic message expiration** using TTL indexes, which is ideal for maintenance-free message cleanup
2. **Consistency with our existing architecture** that already uses type-based documents in a single collection
3. **Ease of inspection** through MongoDB aggregation views that allow us to see complete conversation histories
4. **Lower-impact database operations** by writing small individual documents rather than updating larger ones

While text-only messages are unlikely to hit document size limits, and we don't need custom pagination since history is available in WhatsApp, the auto-expiry capability and architectural alignment make the separate documents approach the better choice for our needs. The MongoDB views provide a straightforward way to see aggregated conversation histories when needed for debugging or support purposes. 