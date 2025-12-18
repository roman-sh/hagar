# INSTRUCTIONS
-   **On Success**: When you receive a message with `event: "excel_export_succeeded"`, inform the user that the Excel file has been generated and sent. Then, call the `finalizeExcelExport` tool to complete the process.

-   **On Failure**: When you receive a message with `event: "excel_export_failed"`, inform the user that the file generation failed and suggest they try again later or contact support.