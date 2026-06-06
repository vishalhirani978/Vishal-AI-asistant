const path = require('path');
const { app } = require('electron');

let puppeteer;
async function ensurePuppeteer() {
  if (!puppeteer) {
    const mod = await import('puppeteer');
    puppeteer = mod.default || mod;
  }
  return puppeteer;
}

const WHATSAPP_URL = 'https://web.whatsapp.com';
const QR_TIMEOUT = 120000;
const SESSION_DIR = 'whatsapp-session';

const BRAVE_PATHS = [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanNumber(phone) {
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  cleaned = cleaned.replace(/^\+/, '');
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.replace(/^00/, '');
  } else if (cleaned.startsWith('0')) {
    cleaned = '92' + cleaned.slice(1);
  }
  return cleaned;
}

async function getLaunchOptions() {
  const pptr = await ensurePuppeteer();
  const bravePath = BRAVE_PATHS.find(p => require('fs').existsSync(p));
  const sessionDir = path.join(app.getPath('userData'), SESSION_DIR);

  const launchOptions = {
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
    userDataDir: sessionDir,
  };

  if (bravePath) {
    launchOptions.executablePath = bravePath;
    console.log(`💬 Using Brave browser: ${bravePath}`);
  } else {
    console.log('💬 Brave not found, using bundled Chrome');
  }
  console.log(`💬 Session saved in: ${sessionDir}`);
  return { pptr, launchOptions };
}

async function waitForWhatsAppLoad(waPage) {
  const isQrPage = await waPage.evaluate(() => {
    return !!(document.querySelector('canvas') || document.querySelector('div[data-testid="qrcode"]'));
  });

  if (isQrPage) {
    console.log('💬 QR code detected — waiting for scan...');
    try {
      await waPage.waitForFunction(
        () => !!(document.querySelector('div[contenteditable]') || document.querySelector('div[data-testid="chat-list"]')),
        { timeout: QR_TIMEOUT, polling: 1000 }
      );
      console.log('💬 QR code scanned successfully');
    } catch {
      return { qrTimeout: true };
    }
  }
  return { qrTimeout: false };
}

// ===== SEND WHATSAPP =====
async function sendWhatsApp(to, message) {
  if (!to) return { success: false, error: 'No recipient specified' };
  if (!message) return { success: false, error: 'No message specified' };

  console.log(`💬 Sending WhatsApp to: ${to}`);
  console.log(`💬 Message: ${message}`);

  let browser;
  try {
    const { pptr, launchOptions } = await getLaunchOptions();
    browser = await pptr.launch(launchOptions);

    const pages = await browser.pages();
    const waPage = pages[0];
    await waPage.setViewport({ width: 1280, height: 800 });

    const phoneClean = cleanNumber(to);
    const chatUrl = `https://web.whatsapp.com/send?phone=${phoneClean}`;
    console.log(`💬 Opening chat: ${chatUrl}`);

    await waPage.goto(chatUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(10000);

    const qrResult = await waitForWhatsAppLoad(waPage);
    if (qrResult.qrTimeout) {
      return { success: false, error: 'QR code scan timed out. Please scan the QR code in the WhatsApp window.' };
    }

    await waPage.waitForFunction(
      () => {
        const sels = ['div[contenteditable]:not([contenteditable="false"])', 'div[aria-label="Type a message"]', 'div[aria-placeholder="Type a message"]'];
        return sels.some(s => document.querySelector(s));
      },
      { timeout: 30000, polling: 500 }
    );

    const msgInput = await waPage.$(
      'div[contenteditable]:not([contenteditable="false"]), div[aria-label="Type a message"], div[aria-placeholder="Type a message"]'
    );
    if (!msgInput) {
      return { success: false, error: 'Could not find message input. WhatsApp may need a phone number without country code.' };
    }

    await msgInput.click();
    await sleep(500);
    await msgInput.type(message, { delay: 30 });
    await sleep(500);
    await waPage.keyboard.press('Enter');

    console.log(`💬 WhatsApp message sent to ${to}`);
    return { success: true, message: `WhatsApp message sent to ${to}` };
  } catch (err) {
    console.error('❌ WhatsApp error:', err.message);
    return { success: false, error: `WhatsApp failed: ${err.message}` };
  } finally {
    if (browser) {
      await sleep(1500);
      try { await browser.close(); } catch (_) { /* ignore */ }
    }
  }
}

// ===== CHECK WHATSAPP INBOX — unread chats + recent senders =====
async function checkWhatsAppInbox() {
  console.log('💬 Checking WhatsApp inbox...');

  let browser;
  try {
    const { pptr, launchOptions } = await getLaunchOptions();
    browser = await pptr.launch(launchOptions);

    const pages = await browser.pages();
    const waPage = pages[0];
    await waPage.setViewport({ width: 1280, height: 800 });

    await waPage.goto(WHATSAPP_URL, { waitUntil: 'load', timeout: 60000 });
    await sleep(8000);

    const qrResult = await waitForWhatsAppLoad(waPage);
    if (qrResult.qrTimeout) {
      return { success: false, error: 'QR code scan timed out. Open WhatsApp Web and scan the QR code first.' };
    }

    // Wait for chat list to appear
    try {
      await waPage.waitForSelector('div[data-testid="chat-list"], div[aria-label="Chat list"], #pane-side', { timeout: 20000 });
    } catch {
      return { success: false, error: 'Could not load WhatsApp chat list. Try again.' };
    }

    await sleep(3000);

    // Extract chat data from the page
    const chatData = await waPage.evaluate(() => {
      const results = [];

      // Try multiple possible selectors for chat items
      const chatItems = document.querySelectorAll(
        'div[data-testid="cell-frame-container"], div[role="listitem"], div[data-testid="chatlist-panel"] > div > div > div'
      );

      chatItems.forEach((item) => {
        try {
          // Contact/group name
          const nameEl = item.querySelector(
            'span[data-testid="cell-frame-title"], span[title], div[data-testid="cell-frame-title"]'
          );
          const name = nameEl ? (nameEl.getAttribute('title') || nameEl.textContent || '').trim() : null;
          if (!name) return;

          // Last message preview
          const msgEl = item.querySelector(
            'span[data-testid="last-msg-status"] + span, div[data-testid="last-msg-status"], span[dir="ltr"]'
          );
          const lastMsg = msgEl ? msgEl.textContent.trim() : '';

          // Unread badge
          const badgeEl = item.querySelector(
            'span[data-testid="icon-unread-count"], span[aria-label*="unread"]'
          );
          const unreadCount = badgeEl ? (parseInt(badgeEl.textContent) || 0) : 0;

          // Time
          const timeEl = item.querySelector(
            'div[data-testid="cell-frame-secondary-detail"] span, span[dir="auto"][class]'
          );
          const time = timeEl ? timeEl.textContent.trim() : '';

          if (name) {
            results.push({ name, lastMsg, unreadCount, time, hasUnread: unreadCount > 0 });
          }
        } catch (_) { /* skip broken items */ }
      });

      return results;
    });

    await browser.close();
    browser = null;

    if (!chatData || chatData.length === 0) {
      return { success: true, message: '💬 WhatsApp loaded but could not read chats. Try again in a moment.' };
    }

    const unreadChats = chatData.filter(c => c.hasUnread);
    const totalChats = chatData.length;

    let message = `💬 WhatsApp Inbox:\n• ${unreadChats.length} unread chat${unreadChats.length !== 1 ? 's' : ''} of ${totalChats} total`;

    if (unreadChats.length > 0) {
      message += `\n\nUnread conversations:`;
      unreadChats.slice(0, 6).forEach((chat) => {
        message += `\n• ${chat.name}`;
        if (chat.unreadCount > 1) message += ` (${chat.unreadCount} messages)`;
        if (chat.lastMsg) message += `\n  "${chat.lastMsg.slice(0, 60)}${chat.lastMsg.length > 60 ? '...' : ''}"`;
      });
    } else {
      message += `\n✅ All caught up — no unread messages!`;
    }

    // Show a few recent chats even if no unread
    if (unreadChats.length === 0 && chatData.length > 0) {
      message += `\n\nRecent chats:`;
      chatData.slice(0, 4).forEach(chat => {
        message += `\n• ${chat.name}`;
        if (chat.time) message += ` — ${chat.time}`;
      });
    }

    console.log(`💬 WhatsApp inbox checked: ${unreadChats.length} unread`);
    return { success: true, message };

  } catch (err) {
    console.error('❌ WhatsApp inbox error:', err.message);
    return { success: false, error: `WhatsApp inbox check failed: ${err.message}` };
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) { /* ignore */ }
    }
  }
}

module.exports = { sendWhatsApp, checkWhatsAppInbox };
