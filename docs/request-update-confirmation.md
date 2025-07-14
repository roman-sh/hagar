# Inventory Update Confirmation Flow

This document outlines the process for requesting and receiving user confirmation for a processed inventory update document. The flow is designed to be robust and efficient, separating data processing from user interaction and leveraging programmatic summaries to inform the agent.


## Step-by-Step Flow

### 1. The Processor (`inventory-update.ts`)

-   After the barcode, vector, and AI matching passes are complete, the processor has the final `doc: InventoryDocument` object.
-   It saves this `doc` object to the active job's data via `job.update({ doc })`.
-   It calls `database.getScanAndStoreDetails(docId)` to retrieve the user's `phone` number and `storeId`.
-   It injects a simple **trigger message** into the `messages` collection. The agent will use the `docId` to fetch all necessary data.
    ```json
    {
       "type": "message",
       "role": "user",
       "phone": "the_user_phone",
       "name": "app",
       "content": {
         "action": "request_inventory_confirmation",
         "docId": "the_document_id"
       },
       "storeId": "the_store_id",
       "createdAt": "timestamp"
    }
    ```
-   It activates the agent by calling `gpt.process({ phone, storeId })`.
-   The processor's work is now done, and it waits in a hanging state.

### 2. The Agent and the Confirmation Tool

-   The agent is activated and sees the new message with `action: "request_inventory_confirmation"`.
-   Its instructions map this action to a single tool call: `requestInventoryConfirmation({ docId })`. The agent acts as a simple relay.

### 3. The All-in-One Tool (`request-inventory-confirmation.ts`)

-   This single, self-sufficient tool handles the entire user-facing action.
-   It receives only the `docId` from the agent.
-   **Logic**:
    1.  Finds the active job using the `docId`.
    2.  Retrieves the `doc` object from `job.data`.
    3.  Calls `database.getScanAndStoreDetails(docId)` to get the user's `phone` number.
    4.  Programmatically generates a rich, structured **summary object** from the `doc`, including item counts and a breakdown by `match_type`.
    5.  Translates this summary object into a user-friendly, natural language `caption` string.
    6.  Dynamically generates a PDF confirmation view by calling `html.generateInventoryConfirmation(doc)`.
    7.  Creates a `MessageMedia` object from the resulting PDF buffer.
    8.  Sends the PDF to the user's WhatsApp, using the generated text as the message caption.

This completes the confirmation request loop, handing control back to the user. 