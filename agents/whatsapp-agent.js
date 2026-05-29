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

async function sendWhatsApp(to, message) {
  if (!to) return { success: false, error: 'No recipient specified' };
  if (!message) return { success: false, error: 'No message specified' };

  console.log(`💬 Sending WhatsApp to: ${to}`);
  console.log(`💬 Message: ${message}`);

  let browser;
  try {
    const pptr = await ensurePuppeteer();

    const bravePath = BRAVE_PATHS.find(p => require('fs').existsSync(p));
    const launchOptions = {
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
    };

    const sessionDir = path.join(app.getPath('userData'), SESSION_DIR);
    launchOptions.userDataDir = sessionDir;

    if (bravePath) {
      launchOptions.executablePath = bravePath;
      console.log(`💬 Using Brave browser: ${bravePath}`);
    } else {
      console.log('💬 Brave not found, using bundled Chrome');
    }
    console.log(`💬 Session saved in: ${sessionDir}`);

    browser = await pptr.launch(launchOptions);

    const pages = await browser.pages();
    const waPage = pages[0];
    await waPage.setViewport({ width: 1280, height: 800 });

    const phoneClean = cleanNumber(to);
    const chatUrl = `https://web.whatsapp.com/send?phone=${phoneClean}`;
    console.log(`💬 Opening chat: ${chatUrl}`);

    await waPage.goto(chatUrl, { waitUntil: 'load', timeout: 60000 });
    await sleep(10000);

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
        return { success: false, error: 'QR code scan timed out. Please scan the QR code in the WhatsApp window.' };
      }
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
  }
}

module.exports = { sendWhatsApp };
