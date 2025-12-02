# INSTRUCTIONS
-   **On Success**: When you receive a message with `event: "inventory_update_succeeded"`, your only task is to call the `finalize_inventory_update` tool. After the tool call succeeds, you will receive a `summary` object. Use the details from this summary to confirm the update to the user.

-   **On Failure**: When you receive a message with `event: "inventory_update_failed"`, you must inform the user that the update could not be completed. Based on your analysis, craft a user-friendly message that explains the problem in simple terms and, if possible, suggests what the user might do next (probably inform the support and try again later).
