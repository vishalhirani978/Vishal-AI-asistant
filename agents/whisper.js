const Groq = require('groq-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Transcribe audio buffer to text using Groq Whisper
 * @param {Buffer} audioBuffer - Raw audio data
 * @param {string} mimeType - e.g. 'audio/webm'
 * @returns {Promise<{success: boolean, text?: string, error?: string}>}
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/webm') {
  try {
    console.log('🎤 Transcribing audio...', audioBuffer.length, 'bytes');

    // Save buffer to temp file (Groq SDK needs a file)
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const ext = mimeType.includes('webm') ? 'webm' : 'wav';
    const tempFile = path.join(tempDir, `recording-${Date.now()}.${ext}`);
    fs.writeFileSync(tempFile, audioBuffer);

    // Send to Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-large-v3-turbo',  // Fast + accurate
      language: 'en',
      response_format: 'json',
      temperature: 0.0,
    });

    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (e) {
      console.warn('Could not delete temp file:', e.message);
    }

    console.log('✅ Transcription:', transcription.text);
    return {
      success: true,
      text: transcription.text.trim(),
    };
  } catch (err) {
    console.error('❌ Transcription failed:', err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = { transcribeAudio };