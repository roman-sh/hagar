import { openai } from '../connections/openai'
import { MessageMedia } from 'whatsapp-web.js'

export const audio = {
    transcribe: async (messageMedia: MessageMedia): Promise<string> => {
        // Convert base64 data to buffer
        const audioBuffer = Buffer.from(messageMedia.data, 'base64')

        // Create file with correct MIME type from WhatsApp
        const audioFile = new File([audioBuffer], messageMedia.filename || 'audio.ogg', {
            type: messageMedia.mimetype
        })

        const response = await openai.audio.transcriptions.create({
            model: 'gpt-4o-transcribe',
            file: audioFile
        })

        return response.text
    }
}