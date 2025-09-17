# Refactor Plan: Concurrent Document Processing

## 1. Objective

To refactor the application to support concurrent processing of multiple documents per user. The system must handle parallel backend workflows while ensuring the user experiences a clean, serialized, single-threaded conversation.

---

## 2. Core Architecture: Autonomous Agent Model

The new architecture moves away from a single, monolithic context per user to a multi-context model where each document process is treated as an autonomous agent.

- **Context Identification:** The `phone` field in the `messages` collection will now serve as the master context key.
    - **General Context:** Identified by the user's plain, real phone number (e.g., `97254...`). This context is handled by a "General Agent."
    - **Document Context:** Identified by a "virtual phone" (`vPhone`) in the format `<realPhone>@<docId>` (e.g., `97254...@scan:store:doc.pdf`). This context is handled by a "Document Agent."

- **Control Flow:** A "Gatekeeper" processor on the outbound message queue, controlled by a Redis lock, will serialize the conversations, ensuring only one document context is "active" for a user at any given time. User-initiated context switching will be handled by escalating to the General Agent.

---

## 3. Step-by-Step Implementation Plan

### Step 1: Data Fetching (The Universal Aggregation Pipeline)

The core of the new design is a universal MongoDB aggregation pipeline. This single, powerful query replaces both the previous data fetching logic and the complex sorting/grouping logic that was in the application code. It correctly fetches and orders the message history for any agent, in any context, in a single, efficient database operation.

```javascript
// This is the 'phone' parameter passed to gpt.process.
// It is either a realPhone or a vPhone.

const pipeline = [
    // STAGE 1: The Universal Match
    // This is the entry point. It finds all documents that could possibly be relevant
    // to the current agent, using the two-part logic we designed.
    {
        $match: {
            $or: [
                // Part 1: Get all high-level conversational messages relevant to the context.
                // For a General Agent (realPhone), this gets all conversations for the user.
                // For a Document Agent (vPhone), this gets only its own conversation.
                {
                    phone: { $regex: `^${phone}` },
                    tool_calls: { $exists: false },
                    tool_call_id: { $exists: false }
                },
                
                // Part 2: Get the specific tool activity for the current agent ONLY.
                {
                    phone: phone, // An exact match on the current context's phone/vPhone
                    $or: [
                        { tool_calls: { $exists: true } },
                        { tool_call_id: { $exists: true } }
                    ]
                }
            ]
        }
    },

    // STAGE 2: Chronological Pre-Sort
    // Before we group the messages into conversations, we must sort them by date.
    // This ensures that when we create the message arrays in the next stage,
    // the messages within each conversation are already in the correct order.
    {
        $sort: { createdAt: 1 }
    },

    // STAGE 3: Group by Conversation
    // This is where we bundle all the messages into their respective conversational threads.
    // The output of this stage is one document per context (per vPhone/realPhone).
    {
        $group: {
            // Use the 'phone' field (our context identifier) as the group key.
            _id: "$phone", 
            
            // For each group, create an array containing all the message documents.
            // '$$ROOT' refers to the entire document.
            messages: { $push: "$$ROOT" }, 
            
            // For each group, we also find the timestamp of the most recent message.
            // This will be our key for sorting the conversations in the next stage.
            lastMessageTime: { $max: "$createdAt" } 
        }
    },

    // STAGE 4: Sort the Conversations
    // Now we sort the groups themselves, placing the most recently active
    // conversation at the end of the list. This is crucial for the AI's
    // understanding of what the user was last talking about.
    {
        $sort: { lastMessageTime: 1 }
    },

    // STAGE 5: Flatten the Groups
    // The data is now perfectly ordered, but it's grouped. We need to deconstruct
    // the 'messages' arrays back into a single, flat stream of documents
    // that the application can easily iterate through.
    {
        $unwind: "$messages"
    },

    // STAGE 6: Restore Document Structure
    // After unwinding, our documents are nested like: { _id: "...", messages: { ... } }.
    // This final stage cleans that up, replacing the entire document with the
    // original message document that was nested inside.
    {
        $replaceRoot: { newRoot: "$messages" }
    }
];

// Execute the single pipeline to get the perfectly ordered history.
const messageDocs = await db.collection('messages').aggregate(pipeline).toArray();
```

### Step 2: Refactor `composeHistory`

With the new aggregation pipeline doing all the heavy lifting of sorting and grouping, the `composeHistory` function becomes dramatically simpler. Its only remaining job is to perform the final, simple point-of-view transformation when the General Agent is active.

```typescript
// The new, ultra-simple composeHistory function
function composeHistory(
    // It receives a perfectly pre-sorted and pre-grouped list from the database.
    messageDocs: MessageDocument[] 
): ChatCompletionMessageParam[] {

    // We can deduce the active context from the very last message in the sorted history.
    // This avoids needing to pass extra parameters.
    const lastMessage = messageDocs.length > 0 ? messageDocs[messageDocs.length - 1] : null;
    const isGeneralAgent = !lastMessage || !lastMessage.phone.includes('@');

    // If it's a Document Agent, its history is already perfect. No transformation needed.
    if (!isGeneralAgent) {
        return messageDocs;
    }

    // It's the General Agent. We perform the final point-of-view transformation.
    return messageDocs.map(msg => {
        const messageForAI = { ...msg };
        
        // The rule: If a message is an assistant report from a Document Agent...
        if (messageForAI.role === 'assistant' && messageForAI.phone.includes('@')) {
            // ...transform it into an incoming 'user' event...
            messageForAI.role = 'user';
            
            // ...and attribute it to the Document Agent by creating a 'name'.
            const docId = messageForAI.phone.split('@')[1];
            messageForAI.name = `agent_${docId}`;
        }
        
        return messageForAI;
    });
}
```

### Step 3: Implement the Gatekeeper (Outbound Queue Processor)

A new processor will be created for the `outboundMessagesQueue`. This replaces the direct sending of messages.

- **Redis Lock:** Use a key like `active_context:<realPhone>` with a value of the active `vPhone`.
- **Logic:**
    - On receiving a job, check the Redis lock for the user's `realPhone`.
    - **If lock is empty or matches the job's `vPhone`:**
        1. Send the message to the user.
        2. Set the Redis lock to the job's `vPhone` with a reasonable TTL (e.g., 30 minutes) to act as a safety net.
        3. Complete the job.
    - **If lock is held by a different `vPhone`:**
        1. Use `job.delayUntil(Date.now() + 5000).save()` to gracefully postpone the job without erroring.
        2. Complete the current processing attempt.

### Step 4: Update Inbound Message Routing

The handler for inbound WhatsApp messages must be updated.

- **Logic:**
    1. On receiving a message from a `realPhone`, check for an `active_context` lock in Redis.
    2. **If a lock exists:** Route the message to the active context. Save the user's message to the database with the `vPhone` from the lock as its `phone` field, and trigger `gpt.process({ phone: vPhone, ... })`.
    3. **If no lock exists:** Route the message to the General Agent. Save the message with the `realPhone` as its `phone` field, and trigger `gpt.process({ phone: realPhone, ... })`.

### Step 5: Create New Tools & Update Prompts

**`escalateToGeneralAgent()` (for Document Agents):**
    - This is the primary tool for a Document Agent when it receives an out-of-scope query.
    - **Logic:** Finds the last message in its own context where `type === 'user_message'`, updates that message's `phone` field to the user's `realPhone`, and then triggers `gpt.process({ phone: realPhone, ... })`.
    - **Returns:** `{ isSilent: true }` to gracefully terminate its own process.

**`switchContext({ targetVPhone: string })` (for the General Agent):**
    - This is a simple, deterministic tool used by the General Agent to change the user's active conversation.
    - **AI Responsibility:** The General Agent's AI is responsible for understanding the user's request (e.g., "let's do doc ABC") and finding the correct, full `targetVPhone` string from its conversational history.
    - **Tool Logic:** The tool receives the exact `targetVPhone`. Its only job is to update the Redis `active_context` lock to this new value. It does not resolve queries or guess contexts.

**`postpone()` (for Document Agents):**
    - A simple tool that allows a user to gracefully exit a conversation that is not ready for finalization.
    - **Logic:** Its only job is to release the `active_context` lock for its `realPhone`, allowing the next pending conversation to begin.

**Update Prompts:**
    - **Document Agent:** The prompt will be simplified. Its primary instruction will be to focus on its task. A new, critical rule will be added: "If the user's message is not directly related to your current document, your only action is to call the `escalateToGeneralAgent` tool." Instructions for the `postpone` tool will also be added.
    - **General Agent:** The prompt will define its role as the central conversational hub. It will be instructed to use its broad context to answer high-level questions and to use the `switchContext` tool when a user explicitly asks to change topics.

### Step 6: Update Task Initiation (`scan-validation.ts`)

- The `scanValidationProcessor` will be the "birthplace" of a document context.
- **Logic:**
    1. Generate the `docId`.
    2. Construct the `vPhone` using the format `<realPhone>@<docId>`.
    3. Save the initial trigger message to the database with this `vPhone` as its `phone`.
    4. Trigger the new process with `gpt.process({ phone: vPhone, ... })`.

---

## 4. Summary of Removals

This refactor will allow us to **delete** the following legacy components, simplifying the codebase:

- The `guardContext` function.
- The `getCurrentContext` function.
- All related logic for `activeDocId` inside `gpt.process`.

---

## 5. Testing Strategy

- **Test Case 1 (Concurrent Initiation):** Upload two documents in rapid succession. Verify that the message for the first document is sent, and the message for the second is held in the `delayed` state in the outbound queue.
- **Test Case 2 (Context Switching):** While in the conversation for Document A, send a message asking to switch to Document B. Verify that Agent A calls the `escalate` tool, the General Agent takes over and calls `switchContext`, the lock is changed, and the pending message for Document B is successfully released.
- **Test Case 3 (Lock Expiry):** Start a conversation for Document A, let the lock be set, and then do nothing for the duration of the TTL. Verify that the lock is automatically removed and that a subsequent pending message for Document B can now proceed.
- **Test Case 4 (Postpone):** Start a conversation for Document A and ask the agent to postpone. Verify the lock is released and the next pending message is sent.
