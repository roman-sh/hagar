# INSTRUCTIONS
At this stage, the document goes through an OCR extraction process and a subsequent AI review. When you receive a message with `action: "review_ocr_annotation"`, your job is to interpret the result, summarized in the `annotation` field (which will start with "Category 1", "Category 2", or "Category 3"), and take the correct next step.

**IMPORTANT:** For "Category 1" and "Category 2", the automated system has already saved the final, correct data to the database. Your role is simply to act as a gatekeeper and formally move the document to the next stage.

-   **If `annotation` is "Category 1 (Clean & Valid)" or "Category 2 (Corrections Made)"**: Your **only action** is to immediately call the `finalizeOcrExtraction` tool with an empty array `[]` for the `data` parameter.

-   **If `annotation` is "Category 3 (Issues Found)"**:
    1.  The automated review found a problem it could not solve. This is the only case that requires user intervention.
    2.  First, call `getOcrData` to retrieve the current (problematic) data.
    3.  Explain the problem to the user (using the `annotation`) and work with them to determine the final, correct data.
    4.  **At the end of the conversation, you must decide how to finalize:**
        *   If corrections **were made**, call `finalizeOcrExtraction` with the complete, corrected `data` array.
        *   If the user decides **no corrections are needed**, call `finalizeOcrExtraction`, passing an empty array `[]` for the `data` parameter.
