# WhatsApp Web.js Documentation

## Sending PDF Documents via URL

This document outlines how to send PDF files via WhatsApp Web.js using direct URLs (like S3 links).

### Prerequisites

- Initialized WhatsApp Web.js client
- PDFs accessible via public URLs (e.g., S3)

### Sending PDF from URL

```javascript
const { MessageMedia } = require('whatsapp-web.js');

/**
 * Send a PDF document from a URL via WhatsApp
 * @param {Client} client - WhatsApp Web.js client instance
 * @param {string} chatId - WhatsApp chat ID to send message to
 * @param {string} pdfUrl - Public URL to the PDF file
 * @param {string} [filename] - Optional filename for the PDF
 * @param {string} [caption] - Optional message caption
 * @returns {Promise<Message>} The sent message
 */
async function sendPdfFromUrl(client, chatId, pdfUrl, filename, caption) {
  try {
    // Create a MessageMedia instance from the URL
    const media = await MessageMedia.fromUrl(pdfUrl, {
      filename: filename || 'document.pdf',
      unsafeMime: false,
    });
    
    // Send the media as a document
    const message = await client.sendMessage(chatId, media, {
      sendMediaAsDocument: true,
      caption: caption || 'Please review this document',
    });
    
    return message;
  } catch (error) {
    console.error('Error sending PDF from URL:', error);
    throw error;
  }
}
```

### MessageMedia.fromUrl() Options

```javascript
{
  filename: string,        // Custom filename for the document
  unsafeMime: boolean,     // Whether to trust the MIME type from the URL
  client: Client,          // WhatsApp client instance (optional)
  reqOptions: RequestInit  // Options for the fetch request (optional)
}
```

### Send Options

```javascript
{
  sendMediaAsDocument: true,   // Send as a document (not as image)
  caption: string,             // Message caption
  quotedMessageId: string,     // ID of message to quote/reply to (optional)
  mentions: string[],          // User IDs to mention (optional)
  sendSeen: boolean            // Whether to mark chat as seen (optional)
}
```

### Best Practices

1. **Public URLs**: Ensure your S3 URLs are publicly accessible
2. **Store message IDs**: Save the message ID (`message.id._serialized`) to track responses
3. **File size limits**: WhatsApp limits file sizes to ~100MB
4. **MIME types**: S3 should provide the correct content-type headers

### Common Issues

1. **"URL not allowed"**: Check that your URL is publicly accessible
2. **MIME type issues**: If needed, use `unsafeMime: true` option
3. **Connection problems**: Ensure the WhatsApp client is authenticated
