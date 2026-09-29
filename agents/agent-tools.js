const { shell, ipcMain } = require('electron');
const { sendEmail, checkEmailInbox, getUnreadEmails, searchEmails } = require('./gmail-agent');
const { sendWhatsApp, checkWhatsAppInbox } = require('./whatsapp-agent');
const { checkInstagramDMs } = require('./instagram-agent');
const contacts = require('./contacts');
const system = require('./system-agent');
require('dotenv').config();

// ===== GEMINI VISION FOR SCREEN AWARENESS =====
const { GoogleGenerativeAI } = require('@google/generative-ai');
let genAI;
function getGenAI() {
  if (!genAI && process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const toolRegistry = [
  // ===== BROWSER TOOLS =====
  {
    name: 'open_url',
    description: 'Open any website in the browser',
    params: {
      url: { type: 'string', required: true, description: 'The URL to open' },
      name: { type: 'string', required: false, description: 'Display name for the site' },
    },
    requiresConfirmation: true,
    async execute(params) {
      let url = params.url;
      if (!url) return { success: false, error: 'No URL provided' };
      if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
      const name = params.name || url;
      try {
        await shell.openExternal(url);
        console.log(`🌐 Tool open_url: ${name} (${url})`);
        return { success: true, message: `Opened ${name}` };
      } catch (err) {
        console.error('❌ Tool open_url error:', err.message);
        return { success: false, error: `Couldn't open ${name}: ${err.message}` };
      }
    },
  },
  {
    name: 'google_search',
    description: 'Search Google for something',
    params: {
      query: { type: 'string', required: true, description: 'The search query' },
    },
    requiresConfirmation: true,
    async execute(params) {
      const query = params.query;
      if (!query) return { success: false, error: 'No search query provided' };
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      try {
        await shell.openExternal(url);
        console.log(`🔍 Tool google_search: ${query}`);
        return { success: true, message: `Searched Google for "${query}"` };
      } catch (err) {
        console.error('❌ Tool google_search error:', err.message);
        return { success: false, error: `Search failed: ${err.message}` };
      }
    },
  },
  {
    name: 'open_youtube',
    description: 'Open YouTube, optionally with a search',
    params: {
      search: { type: 'string', required: false, description: 'Optional search query on YouTube' },
    },
    requiresConfirmation: true,
    async execute(params) {
      let url = 'https://youtube.com';
      if (params.search) url = `https://youtube.com/results?search_query=${encodeURIComponent(params.search)}`;
      try {
        await shell.openExternal(url);
        const label = params.search ? `YouTube search: ${params.search}` : 'YouTube';
        console.log(`🎬 Tool open_youtube: ${label}`);
        return { success: true, message: `Opened ${label}` };
      } catch (err) {
        console.error('❌ Tool open_youtube error:', err.message);
        return { success: false, error: `Couldn't open YouTube: ${err.message}` };
      }
    },
  },

  // ===== EMAIL TOOLS =====
  {
    name: 'open_gmail',
    description: 'Open Gmail in the browser',
    params: {},
    requiresConfirmation: true,
    async execute() {
      try {
        await shell.openExternal('https://mail.google.com');
        console.log('📧 Tool open_gmail');
        return { success: true, message: 'Opened Gmail' };
      } catch (err) {
        console.error('❌ Tool open_gmail error:', err.message);
        return { success: false, error: `Couldn't open Gmail: ${err.message}` };
      }
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail',
    params: {
      to: { type: 'string', required: true, description: 'Recipient email address or contact name' },
      subject: { type: 'string', required: true, description: 'Email subject line' },
      body: { type: 'string', required: true, description: 'Email body content' },
    },
    requiresConfirmation: true,
    async execute(params) {
      const resolved = contacts.resolveRecipient(params.to);
      const recipientEmail = resolved.email || params.to;
      return await sendEmail(recipientEmail, params.subject, params.body);
    },
  },
  {
    name: 'check_email_inbox',
    description: 'Check Gmail inbox — see unread email count and recent senders',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await checkEmailInbox();
    },
  },
  {
    name: 'get_unread_emails',
    description: 'Fetch unread emails from Gmail with sender, subject, and preview',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await getUnreadEmails();
    },
  },
  {
    name: 'search_emails',
    description: 'Search Gmail inbox by sender name or subject keyword',
    params: {
      query: { type: 'string', required: true, description: 'Search term — sender name or subject keyword' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return await searchEmails(params.query);
    },
  },

  // ===== WHATSAPP TOOLS =====
  {
    name: 'open_whatsapp_web',
    description: 'Open WhatsApp Web in the browser',
    params: {},
    requiresConfirmation: true,
    async execute() {
      try {
        await shell.openExternal('https://web.whatsapp.com');
        console.log('💬 Tool open_whatsapp_web');
        return { success: true, message: 'Opened WhatsApp Web' };
      } catch (err) {
        console.error('❌ Tool open_whatsapp_web error:', err.message);
        return { success: false, error: `Couldn't open WhatsApp: ${err.message}` };
      }
    },
  },
  {
    name: 'send_whatsapp',
    description: 'Send a WhatsApp message to a contact via WhatsApp Web',
    params: {
      to: { type: 'string', required: true, description: 'Contact name or phone number' },
      message: { type: 'string', required: true, description: 'Message text to send' },
    },
    requiresConfirmation: true,
    async execute(params) {
      const resolved = contacts.resolveRecipient(params.to);
      const recipientPhone = resolved.phone || params.to;

      // Check if we have a valid phone number (not just a name)
      const looksLikePhone = /^[\+\d\s\-\(\)]{7,}$/.test(recipientPhone);
      if (!looksLikePhone && !resolved.resolved) {
        return {
          success: false,
          error: `No phone number found for "${params.to}". Please add them as a contact first! Say: "Add contact ${params.to} with phone +91XXXXXXXXXX"`,
        };
      }

      return await sendWhatsApp(recipientPhone, params.message);
    },
  },
  {
    name: 'check_whatsapp_inbox',
    description: 'Check WhatsApp inbox for unread chats, recent senders, and message previews',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await checkWhatsAppInbox();
    },
  },

  // ===== INSTAGRAM TOOLS =====
  {
    name: 'check_instagram_dms',
    description: 'Check Instagram DMs for new messages and unread conversations',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await checkInstagramDMs();
    },
  },

  // ===== CONTACT BOOK TOOLS =====
  {
    name: 'add_contact',
    description: 'Add or update a contact in the contact book with name, phone number, and email',
    params: {
      name: { type: 'string', required: true, description: 'Contact name (e.g. "Mummy", "John")' },
      phone: { type: 'string', required: false, description: 'Phone number with country code' },
      email: { type: 'string', required: false, description: 'Email address' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return contacts.addContact(params.name, params.phone, params.email);
    },
  },
  {
    name: 'list_contacts',
    description: 'List all contacts in the contact book',
    params: {},
    requiresConfirmation: true,
    async execute() {
      const all = contacts.getAllContacts();
      if (all.length === 0) {
        return { success: true, message: '📇 No contacts saved yet. Say "Add contact [name]" to get started!' };
      }
      let message = `📇 ${all.length} contact${all.length !== 1 ? 's' : ''}:\n`;
      all.forEach((c, i) => {
        message += `\n${i + 1}. ${c.name}`;
        if (c.phone) message += `  📱 ${c.phone}`;
        if (c.email) message += `  📧 ${c.email}`;
      });
      return { success: true, message };
    },
  },
  {
    name: 'remove_contact',
    description: 'Remove a contact from the contact book by name',
    params: {
      name: { type: 'string', required: true, description: 'The name of the contact to remove' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return contacts.removeContact(params.name);
    },
  },
  {
    name: 'search_contact',
    description: 'Search for a contact by name and see their phone number and email',
    params: {
      query: { type: 'string', required: true, description: 'Contact name or partial name to search for' },
    },
    requiresConfirmation: true,
    async execute(params) {
      const result = contacts.resolveRecipient(params.query);
      if (result.resolved) {
        const c = result.contact;
        let message = `📇 Found: ${c.name}`;
        if (c.phone) message += `\n📱 Phone: ${c.phone}`;
        if (c.email) message += `\n📧 Email: ${c.email}`;
        if (c.notes) message += `\n📝 Notes: ${c.notes}`;
        return { success: true, message };
      }
      return { success: false, error: `No contact found for "${params.query}"` };
    },
  },

  // ===== SCREEN AWARENESS =====
  {
    name: 'analyze_screen',
    description: 'Take a screenshot and analyze what is currently on screen using AI vision',
    params: {
      question: { type: 'string', required: false, description: 'Optional specific question about what you see on screen' },
    },
    requiresConfirmation: true,
    async execute(params) {
      try {
        console.log('📸 analyze_screen: requesting screenshot...');
        // Capture screen via main process IPC
        const { ipcMain: ipc } = require('electron');
        // We'll use a different approach — import the capture function directly
        // Since we're in the main process, we use desktopCapturer directly
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1280, height: 720 },
        });

        if (!sources || sources.length === 0) {
          return { success: false, error: 'Could not capture screen' };
        }

        const dataUrl = sources[0].thumbnail.toDataURL();
        const base64 = dataUrl.split(',')[1];

        const ai = getGenAI();
        if (!ai) {
          return { success: false, error: 'Gemini API key not set. Add GEMINI_API_KEY to your .env file.' };
        }

        const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const question = params.question || 'Describe what you see on this screen in detail. What application is open? What is the user doing?';

        const result = await model.generateContent([
          question,
          { inlineData: { mimeType: 'image/png', data: base64 } },
        ]);

        const text = result.response.text();
        console.log('👁️ Screen analysis:', text.substring(0, 100));
        return { success: true, message: text };
      } catch (err) {
        console.error('❌ analyze_screen error:', err.message);
        return { success: false, error: `Screen analysis failed: ${err.message}` };
      }
    },
  },

  // ===== SYSTEM CONTROL TOOLS =====
  {
    name: 'system_shutdown',
    description: 'Shutdown the PC immediately or after a delay in minutes',
    params: {
      minutes: { type: 'number', required: false, description: 'Minutes to wait before shutdown (0 = immediately)' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return await system.shutdownPC(params.minutes || 0);
    },
  },
  {
    name: 'system_restart',
    description: 'Restart the PC immediately or after a delay in minutes',
    params: {
      minutes: { type: 'number', required: false, description: 'Minutes to wait before restart (0 = immediately)' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return await system.restartPC(params.minutes || 0);
    },
  },
  {
    name: 'system_cancel_shutdown',
    description: 'Cancel a scheduled shutdown or restart',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await system.cancelShutdown();
    },
  },
  {
    name: 'system_lock',
    description: 'Lock the Windows screen',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await system.lockScreen();
    },
  },
  {
    name: 'system_sleep',
    description: 'Put the PC to sleep / suspend mode',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await system.sleepPC();
    },
  },
  {
    name: 'system_volume',
    description: 'Set the system volume to a specific level (0–100)',
    params: {
      level: { type: 'number', required: true, description: 'Volume level from 0 (silent) to 100 (max)' },
    },
    requiresConfirmation: true,
    async execute(params) {
      return await system.setVolume(params.level);
    },
  },
  {
    name: 'system_mute',
    description: 'Toggle mute/unmute the system audio',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await system.muteAudio();
    },
  },
];

function findTool(name) {
  return toolRegistry.find(t => t.name === name) || null;
}

function getToolDescriptions() {
  return toolRegistry.map(t => {
    const paramList = Object.entries(t.params)
      .map(([key, val]) => `${key}${val.required ? '' : '?'}: ${val.type}`)
      .join(', ');
    return `${t.name}(${paramList}) — ${t.description}`;
  }).join('\n');
}

async function executeTool(name, params) {
  const tool = findTool(name);
  if (!tool) return { success: false, error: `Unknown tool: ${name}` };
  return await tool.execute(params);
}

module.exports = { toolRegistry, findTool, getToolDescriptions, executeTool };
