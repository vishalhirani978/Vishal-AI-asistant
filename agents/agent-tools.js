const { shell } = require('electron');
const { sendEmail } = require('./gmail-agent');
const { sendWhatsApp } = require('./whatsapp-agent');
const { checkInstagramDMs } = require('./instagram-agent');
const contacts = require('./contacts');

const toolRegistry = [
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
      if (!url) {
        return { success: false, error: 'No URL provided' };
      }
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
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
      if (!query) {
        return { success: false, error: 'No search query provided' };
      }
      const encoded = encodeURIComponent(query);
      const url = `https://www.google.com/search?q=${encoded}`;
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
      if (params.search) {
        url = `https://youtube.com/results?search_query=${encodeURIComponent(params.search)}`;
      }
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
    name: 'send_email',
    description: 'Send an email via Gmail',
    params: {
      to: { type: 'string', required: true, description: 'Recipient email address or name' },
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
      const recipientName = resolved.name || params.to;
      return await sendWhatsApp(recipientPhone, params.message);
    },
  },
  {
    name: 'check_instagram_dms',
    description: 'Check Instagram DMs for new messages and unread conversations',
    params: {},
    requiresConfirmation: true,
    async execute() {
      return await checkInstagramDMs();
    },
  },
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
  if (!tool) {
    return { success: false, error: `Unknown tool: ${name}` };
  }
  return await tool.execute(params);
}

module.exports = { toolRegistry, findTool, getToolDescriptions, executeTool };
