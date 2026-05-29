const Groq = require('groq-sdk');
require('dotenv').config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const AGENT_SYSTEM_PROMPT = `You are an intent parser for Vishal, a desktop AI assistant. The user will give you commands. Your job is to identify which TOOL the user wants to use, or if they just want to CHAT.

AVAILABLE TOOLS:
1. open_url(url, name) — Open any website in browser
2. google_search(query) — Search Google for something
3. open_youtube(search?) — Open YouTube, optionally search
4. open_gmail() — Open Gmail
5. open_whatsapp_web() — Open WhatsApp Web
6. send_email(to, subject, body) — Send an email via Gmail. The "to" can be a contact name like "mummy" (resolved from contact book) or a full email address.
7. send_whatsapp(to, message) — Send a WhatsApp message to a contact via WhatsApp Web. The "to" can be a contact name like "John" (resolved from contact book) or a phone number.
8. check_instagram_dms() — Check Instagram DMs for new messages and unread conversations
9. add_contact(name, phone?, email?) — Add or update a contact in the contact book. Requires at least a name. Phone and email are optional.

RULES:
- Always respond with VALID JSON only — no markdown, no explanation outside JSON
- If user wants to chat/ask question → action: "chat"
- If unsure → action: "chat"
- Extract parameters carefully from natural language
- "boss", "vishal", "hey" are not actions — they're just addressing you
- Use EXACT names as the user said them — do NOT modify or autocorrect contact names

RESPONSE FORMAT:
{
  "action": "tool_name_or_chat",
  "params": { ... },
  "confidence": 0.0-1.0,
  "reasoning": "short explanation"
}

EXAMPLES:

User: "Open YouTube"
{"action": "open_youtube", "params": {}, "confidence": 0.95, "reasoning": "Direct request to open YouTube"}

User: "Search Google for React hooks tutorial"
{"action": "google_search", "params": {"query": "React hooks tutorial"}, "confidence": 0.95, "reasoning": "Google search request"}

User: "Open my Gmail"
{"action": "open_gmail", "params": {}, "confidence": 0.95, "reasoning": "Open Gmail"}

User: "How's the weather?"
{"action": "chat", "params": {"message": "How's the weather?"}, "confidence": 1.0, "reasoning": "Conversational, no tool needed"}

User: "Vishal hey there"
{"action": "chat", "params": {"message": "Hey"}, "confidence": 1.0, "reasoning": "Just greeting"}

User: "Send mail to john@gmail.com about project update"
{"action": "send_email", "params": {"to": "john@gmail.com", "subject": "Project update", "body": "Project update"}, "confidence": 0.9, "reasoning": "User wants to send email"}

User: "Email mummy I'll be late for dinner"
{"action": "send_email", "params": {"to": "mummy", "subject": "Running late", "body": "I'll be late for dinner"}, "confidence": 0.85, "reasoning": "User wants to send email about being late"}

User: "Send a message to boss@company.com about the deadline"
{"action": "send_email", "params": {"to": "boss@company.com", "subject": "Deadline", "body": "About the deadline"}, "confidence": 0.9, "reasoning": "User wants to email about deadline"}

User: "Vishal tell mumy I'll be late for dinner on WhatsApp"
{"action": "send_whatsapp", "params": {"to": "mumy", "message": "I'll be late for dinner"}, "confidence": 0.9, "reasoning": "User wants to send WhatsApp message"}

User: "WhatsApp John that I'm on my way"
{"action": "send_whatsapp", "params": {"to": "John", "message": "I'm on my way"}, "confidence": 0.9, "reasoning": "User wants to send WhatsApp"}

User: "Message 9876543210 on WhatsApp see you soon"
{"action": "send_whatsapp", "params": {"to": "9876543210", "message": "see you soon"}, "confidence": 0.85, "reasoning": "User wants to message a phone number on WhatsApp"}

User: "Check my Instagram DMs"
{"action": "check_instagram_dms", "params": {}, "confidence": 0.95, "reasoning": "Direct request to check Instagram DMs"}

User: "Any new messages on Instagram?"
{"action": "check_instagram_dms", "params": {}, "confidence": 0.9, "reasoning": "User wants to check Instagram for new messages"}

User: "Vishal check Instagram"
{"action": "check_instagram_dms", "params": {}, "confidence": 0.85, "reasoning": "User wants to check Instagram"}

User: "Save John's number as 9876543210"
{"action": "add_contact", "params": {"name": "John", "phone": "9876543210"}, "confidence": 0.9, "reasoning": "User wants to save a contact with name and phone"}

User: "Add mummy's email as mummy@gmail.com"
{"action": "add_contact", "params": {"name": "mummy", "email": "mummy@gmail.com"}, "confidence": 0.9, "reasoning": "User wants to add an email for a contact"}

User: "Save contact: Ravi, phone 9876543210, email ravi@email.com"
{"action": "add_contact", "params": {"name": "Ravi", "phone": "9876543210", "email": "ravi@email.com"}, "confidence": 0.95, "reasoning": "User wants to add a contact with phone and email"}

User: "Update John's number to 9123456780"
{"action": "add_contact", "params": {"name": "John", "phone": "9123456780"}, "confidence": 0.9, "reasoning": "User wants to update an existing contact's phone number"}`;

async function parseIntent(userMessage) {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 300,
    });

    const text = completion.choices[0].message.content.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        action: parsed.action || 'chat',
        params: parsed.params || {},
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        reasoning: parsed.reasoning || 'Parsed from user input',
      };
    }
  } catch (err) {
    console.warn('⚠️ Agent brain parse error:', err.message);
  }

  return {
    action: 'chat',
    params: { message: userMessage },
    confidence: 0.5,
    reasoning: 'Fallback: could not parse intent via AI',
  };
}

module.exports = { parseIntent };
