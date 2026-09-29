const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { VISHAL_PERSONALITY } = require('./personality');

require('dotenv').config();

// Verify personality loaded correctly
if (!VISHAL_PERSONALITY) {
  console.error('❌ CRITICAL: VISHAL_PERSONALITY is undefined! Check personality.js');
} else {
  console.log('✅ Personality loaded, length:', VISHAL_PERSONALITY.length);
}

// Verify API keys loaded
if (!process.env.GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY missing from .env');
}
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY missing from .env');
}

// Initialize APIs
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Conversation memory
let conversationHistory = [];
const MAX_HISTORY = 10;

/**
 * Main function: Get Vishal's response
 */
async function askVishal(userMessage) {
  console.log('🧠 Brain: Processing message:', userMessage);
  
  // Add user message to history
  conversationHistory.push({ role: 'user', content: userMessage });
  
  if (conversationHistory.length > MAX_HISTORY) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY);
  }
  
  try {
    const response = await askGroq(userMessage);
    conversationHistory.push({ role: 'assistant', content: response });
    return { success: true, response, source: 'groq' };
  } catch (groqError) {
    console.warn('⚠️ Groq failed:', groqError.message);
    console.log('🔄 Trying Gemini fallback...');
    
    try {
      const response = await askGemini(userMessage);
      conversationHistory.push({ role: 'assistant', content: response });
      return { success: true, response, source: 'gemini' };
    } catch (geminiError) {
      console.error('❌ Both APIs failed');
      console.error('Gemini error:', geminiError.message);
      // Remove the failed user message from history
      conversationHistory.pop();
      return {
        success: false,
        response: "Sorry boss, I'm having trouble connecting right now. Try again in a sec?",
        source: 'fallback'
      };
    }
  }
}

/**
 * Ask Groq (Llama 3.3 70B — fastest model)
 */
async function askGroq(userMessage) {
  // Defensive: ensure personality exists
  const systemPrompt = VISHAL_PERSONALITY || "You are Vishal, a friendly AI assistant. Reply in short English sentences.";
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];
  
  console.log('📤 Sending to Groq, messages count:', messages.length);
  
  const completion = await groq.chat.completions.create({
    messages: messages,
    model: 'openai/gpt-oss-120b',
    temperature: 0.7,
    max_tokens: 250,
    top_p: 0.9
  });
  
  return completion.choices[0].message.content.trim();
}

/**
 * Ask Gemini (fallback) — using CURRENT model name
 */
async function askGemini(userMessage) {
  const systemPrompt = VISHAL_PERSONALITY || "You are Vishal, a friendly AI assistant. Reply in short English sentences.";
  
  const model = gemini.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt
  });
  
  // Build chat history in Gemini format (excluding the latest user message)
  const history = conversationHistory.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  
  console.log('📤 Sending to Gemini, history count:', history.length);
  
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text().trim();
}

function clearMemory() {
  conversationHistory = [];
  console.log('🧹 Memory cleared');
}

module.exports = { askVishal, clearMemory };