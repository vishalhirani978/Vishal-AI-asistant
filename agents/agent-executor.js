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
  open_url: (params) => `Open ${params.name || params.url}`,
  google_search: (params) => `Search Google for "${params.query}"`,
  open_youtube: (params) => params.search ? `Search YouTube for "${params.search}"` : 'Open YouTube',
  open_gmail: () => 'Open Gmail',
  open_whatsapp_web: () => 'Open WhatsApp Web',
  send_email: (params) => `Send email to ${resolveContact(params.to)}`,
  send_whatsapp: (params) => `Send WhatsApp to ${resolveContact(params.to)}`,
  check_instagram_dms: () => 'Check your Instagram DMs',
  add_contact: (params) => {
    let label = `Add contact "${params.name}"`;
    if (params.phone) label += ` 📱 ${params.phone}`;
    if (params.email) label += ` 📧 ${params.email}`;
    return label;
  },
};

const ACTION_TEMPLATES = {
  open_url: (params) => `I'll open ${params.url || params.name}`,
  google_search: (params) => `I'll search Google for "${params.query}"`,
  open_youtube: (params) => params.search
    ? `I'll search YouTube for "${params.search}"`
    : 'I\'ll open https://youtube.com',
  open_gmail: () => "I'll open https://mail.google.com",
  open_whatsapp_web: () => "I'll open https://web.whatsapp.com",
  send_email: (params) => `To: ${params.to}\nSubject: ${params.subject}\nBody: ${params.body}`,
  send_whatsapp: (params) => `To: ${params.to}\nMessage: ${params.message}`,
  check_instagram_dms: () => "I'll open Instagram and check your DMs",
  add_contact: (params) => {
    let text = `Name: ${params.name}`;
    if (params.phone) text += `\nPhone: ${params.phone}`;
    if (params.email) text += `\nEmail: ${params.email}`;
    return text;
  },
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
