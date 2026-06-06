const { findTool, executeTool } = require('./agent-tools');
const contacts = require('./contacts');

function resolveContact(to) {
  const resolved = contacts.resolveRecipient(to);
  if (resolved.resolved) {
    const parts = [];
    if (resolved.email) parts.push(`📧 ${resolved.email}`);
    if (resolved.phone) parts.push(`📱 ${resolved.phone}`);
    const extra = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    return `${resolved.name}${extra}`;
  }
  return to;
}

const DESCRIPTION_TEMPLATES = {
  // Browser
  open_url: (params) => `Open ${params.name || params.url}`,
  google_search: (params) => `Search Google for "${params.query}"`,
  open_youtube: (params) => params.search ? `Search YouTube for "${params.search}"` : 'Open YouTube',
  // Email
  open_gmail: () => 'Open Gmail',
  send_email: (params) => `Send email to ${resolveContact(params.to)}`,
  check_email_inbox: () => 'Check Gmail inbox',
  get_unread_emails: () => 'Fetch unread emails from Gmail',
  search_emails: (params) => `Search Gmail for "${params.query}"`,
  // WhatsApp
  open_whatsapp_web: () => 'Open WhatsApp Web',
  send_whatsapp: (params) => `Send WhatsApp to ${resolveContact(params.to)}`,
  check_whatsapp_inbox: () => 'Check WhatsApp inbox for unread chats',
  // Instagram
  check_instagram_dms: () => 'Check your Instagram DMs',
  // Contacts
  add_contact: (params) => {
    let label = `Add contact "${params.name}"`;
    if (params.phone) label += ` 📱 ${params.phone}`;
    if (params.email) label += ` 📧 ${params.email}`;
    return label;
  },
  list_contacts: () => 'List all contacts',
  remove_contact: (params) => `Remove contact "${params.name}"`,
  search_contact: (params) => `Look up "${params.query}" in contacts`,
  // System Controls
  system_shutdown: (params) => params.minutes ? `Shutdown PC in ${params.minutes} minute(s)` : 'Shutdown PC now',
  system_restart: (params) => params.minutes ? `Restart PC in ${params.minutes} minute(s)` : 'Restart PC now',
  system_cancel_shutdown: () => 'Cancel scheduled shutdown/restart',
  system_lock: () => 'Lock the screen',
  system_sleep: () => 'Put PC to sleep',
  system_volume: (params) => `Set volume to ${params.level}%`,
  system_mute: () => 'Mute/unmute audio',
};

const ACTION_TEMPLATES = {
  // Browser
  open_url: (params) => `I'll open ${params.url || params.name}`,
  google_search: (params) => `I'll search Google for "${params.query}"`,
  open_youtube: (params) => params.search
    ? `I'll search YouTube for "${params.search}"`
    : "I'll open https://youtube.com",
  // Email
  open_gmail: () => "I'll open https://mail.google.com",
  send_email: (params) => `To: ${params.to}\nSubject: ${params.subject}\nBody: ${params.body}`,
  check_email_inbox: () => "I'll connect to Gmail via IMAP and check your inbox",
  get_unread_emails: () => "I'll fetch your unread emails with sender, subject, and preview",
  search_emails: (params) => `I'll search your Gmail inbox for "${params.query}"`,
  // WhatsApp
  open_whatsapp_web: () => "I'll open https://web.whatsapp.com",
  send_whatsapp: (params) => `To: ${params.to}\nMessage: ${params.message}`,
  check_whatsapp_inbox: () => "I'll open WhatsApp Web and check for unread chats",
  // Instagram
  check_instagram_dms: () => "I'll open Instagram and check your DMs",
  // Contacts
  add_contact: (params) => {
    let text = `Name: ${params.name}`;
    if (params.phone) text += `\nPhone: ${params.phone}`;
    if (params.email) text += `\nEmail: ${params.email}`;
    return text;
  },
  list_contacts: () => "I'll show you all your saved contacts",
  remove_contact: (params) => `I'll permanently delete "${params.name}" from your contacts`,
  search_contact: (params) => `I'll look up "${params.query}" in your contact book`,
  // System Controls
  system_shutdown: (params) => params.minutes
    ? `⚠️ PC will shut down in ${params.minutes} minute(s)`
    : '⚠️ PC will shut down immediately',
  system_restart: (params) => params.minutes
    ? `⚠️ PC will restart in ${params.minutes} minute(s)`
    : '⚠️ PC will restart immediately',
  system_cancel_shutdown: () => "I'll cancel the scheduled shutdown/restart",
  system_lock: () => "I'll lock your Windows screen",
  system_sleep: () => "I'll put your PC into sleep mode",
  system_volume: (params) => `I'll set system volume to ${params.level}%`,
  system_mute: () => "I'll toggle mute on your system audio",
};

function buildConfirmation(action, params) {
  const tool = findTool(action);
  if (!tool) {
    return {
      needsConfirmation: false,
      error: `Unknown tool: ${action}`,
    };
  }

  const titleFn = DESCRIPTION_TEMPLATES[action] || (() => `Run ${action}?`);
  const descFn = ACTION_TEMPLATES[action] || (() => `Execute tool: ${action}`);

  return {
    needsConfirmation: true,
    title: `🎯 ${titleFn(params)}?`,
    description: descFn(params),
    toolName: action,
    params: params,
    requiresConfirmation: tool.requiresConfirmation,
  };
}

async function executeConfirmed(toolName, params) {
  console.log(`🎬 Agent executing: ${toolName}`, JSON.stringify(params));
  const result = await executeTool(toolName, params);
  console.log(`🎬 Agent result:`, JSON.stringify(result));
  return result;
}

module.exports = { buildConfirmation, executeConfirmed };
