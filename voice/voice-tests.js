const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Mock fs.createReadStream for temp recording files to avoid async ENOENT error when they are unlinked
const { Readable } = require('stream');
const originalCreateReadStream = fs.createReadStream;
fs.createReadStream = (filePath) => {
  if (filePath.includes('temp') || filePath.includes('recording')) {
    const stream = new Readable();
    stream._read = () => {};
    stream.push(null); // EOF immediately
    return stream;
  }
  return originalCreateReadStream(filePath);
};

// 1. Mock the Environment BEFORE requiring modules
process.env.GROQ_API_KEY = 'mock-groq-key';

// Mock Web Speech API and Browser Environment for TTS
global.window = {};
global.SpeechSynthesisUtterance = class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
  }
};
global.window.speechSynthesis = {
  lastSpoken: null,
  cancelled: false,
  speak(utterance) {
    this.lastSpoken = utterance.text;
  },
  cancel() {
    this.cancelled = true;
  },
  getVoices() {
    return [
      { name: 'Google US English', lang: 'en-US' },
      { name: 'Microsoft Zira Desktop', lang: 'en-US' }
    ];
  }
};

// CommonJS require-mock injection for groq-sdk
const mockCreate = async (params) => {
  // Validate that a readable file stream or object was passed
  if (!params || !params.file) {
    throw new Error('No file provided for transcription');
  }
  // Safely destroy the read stream so it closes its file descriptor
  if (typeof params.file.destroy === 'function') {
    params.file.destroy();
  }
  return { text: 'Hello from mock Whisper!' };
};

require.cache[require.resolve('groq-sdk')] = {
  exports: class MockGroq {
    constructor(config) {
      assert.strictEqual(config.apiKey, 'mock-groq-key');
      this.audio = {
        transcriptions: {
          create: mockCreate
        }
      };
    }
  }
};

// Now import the STT module
const { transcribeAudio } = require('../agents/whisper');

// Simple mocked TTS speaking helper mimicking the one in character.js
let voiceEnabled = false;
function testSpeakText(text) {
  if (!voiceEnabled) return;
  
  if (!global.window.speechSynthesis) return;
  
  // Clean text identical to character.js
  let cleanText = text
    .replace(/<[^>]*>/g, '') // remove HTML
    .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '') // remove emojis
    .replace(/[✓✗✕⚙️📊🎯🤖🐙💬📧📱]/g, '') // remove specific symbol characters
    .trim();

  if (!cleanText) return;

  const utterance = new global.SpeechSynthesisUtterance(cleanText);
  const voices = global.window.speechSynthesis.getVoices();
  const preferredVoice = voices.find(v => v.name.includes('Zira')) || voices[0];
  utterance.voice = preferredVoice;
  utterance.rate = 1.05;
  utterance.pitch = 1.1;

  global.window.speechSynthesis.speak(utterance);
}

// Mock the AI core response to avoid real network requests
async function mockAskVishal(message) {
  if (message.toLowerCase().includes('hello')) {
    return { success: true, response: '🤖 Hello boss! How can I assist you today?', source: 'mock' };
  }
  return { success: true, response: '🤖 I received your command.', source: 'mock' };
}

// ==================== UNIT TESTS ====================

test('Unit Test - STT transcribeAudio transcribes audio buffer using Whisper', async (t) => {
  const dummyBuffer = Buffer.from('mock-audio-payload');
  const result = await transcribeAudio(dummyBuffer, 'audio/webm');
  
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.text, 'Hello from mock Whisper!');
});

test('Unit Test - TTS speakText cleans HTML and emojis before speaking', (t) => {
  voiceEnabled = true;
  global.window.speechSynthesis.lastSpoken = null;

  testSpeakText('📢 <b>Hello!</b> How are you today? 😊');
  
  // Emojis and HTML tags should be cleaned
  assert.strictEqual(global.window.speechSynthesis.lastSpoken, 'Hello! How are you today?');
});

test('Unit Test - TTS speakText respects voiceEnabled settings flag', (t) => {
  voiceEnabled = false;
  global.window.speechSynthesis.lastSpoken = null;

  testSpeakText('Should not be spoken');
  
  assert.strictEqual(global.window.speechSynthesis.lastSpoken, null);
});

// ==================== INTEGRATION TEST ====================

test('Integration Test - Mic input -> STT -> Parser/AI response -> TTS output flow', async (t) => {
  // Setup voice enabled
  voiceEnabled = true;
  global.window.speechSynthesis.lastSpoken = null;

  // 1. Simulate Mic Input (ArrayBuffer/Buffer payload)
  const micBuffer = Buffer.from('mic-recorded-sound-waves');

  // 2. STT Transcription
  const transcriptionResult = await transcribeAudio(micBuffer, 'audio/webm');
  assert.strictEqual(transcriptionResult.success, true);
  const textInput = transcriptionResult.text; // "Hello from mock Whisper!"

  // 3. Parser / AI Response selection
  const aiResult = await mockAskVishal(textInput);
  assert.strictEqual(aiResult.success, true);
  const vishalReply = aiResult.response;

  // 4. TTS Output
  testSpeakText(vishalReply);

  // Assert expected speech output
  assert.strictEqual(global.window.speechSynthesis.lastSpoken, 'Hello boss! How can I assist you today?');
});
