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

const INSTAGRAM_URL = 'https://www.instagram.com';
const LOGIN_TIMEOUT = 120000;
const SESSION_DIR = 'instagram-session';

const BRAVE_PATHS = [
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
];

const SELECTORS = {
  loginButton: 'button[type="submit"]',
  usernameInput: 'input[name="username"]',
  passwordInput: 'input[name="password"]',
  saveInfoButton: 'button:has-text("Save Info")',
  notNowButton: 'button:has-text("Not Now")',
  dmsLink: 'a[href="/direct/inbox/"]',
  dmItems: 'div[role="listitem"]',
  dmSender: 'span._ap3a._aaco._aacw._aacx._aad7._aade',
  dmMessage: 'div._a9zs',
  dmUnreadBadge: 'div[role="listitem"] svg[aria-label="Unread"]',
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkInstagramDMs() {
  console.log('📸 Checking Instagram DMs...');

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

    if (bravePath) {
      launchOptions.executablePath = bravePath;
      launchOptions.userDataDir = sessionDir;
      console.log(`📸 Using Brave browser: ${bravePath}`);
      console.log(`📸 Session saved in: ${sessionDir}`);
    } else {
      console.log('📸 Brave not found, using bundled Chrome');
    }

    browser = await pptr.launch(launchOptions);
    const [page] = await browser.pages();
    await page.setViewport({ width: 1280, height: 800 });

    await page.goto(INSTAGRAM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const isLoggedIn = await checkLoggedIn(page);
    if (!isLoggedIn) {
      return { success: false, error: 'Instagram login required. Please log in to Instagram in the browser window that opened.' };
    }

    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000);

    const dmItems = await page.$$(SELECTORS.dmItems);

    if (!dmItems || dmItems.length === 0) {
      console.log('📸 No DMs found');
      return { success: true, message: 'No DMs found in your inbox.' };
    }

    const unreadCount = await page.evaluate((sel) => {
      return document.querySelectorAll(sel).length;
    }, SELECTORS.dmUnreadBadge);

    const dms = [];
    const maxToCheck = Math.min(dmItems.length, 5);

    for (let i = 0; i < maxToCheck; i++) {
      try {
        const items = await page.$$(SELECTORS.dmItems);
        if (!items[i]) continue;

        const text = await page.evaluate(el => el.textContent.trim(), items[i]);
        dms.push(text);

        if (i === 0 && unreadCount > 0) {
          await items[i].click();
          await sleep(2000);

          const messages = await page.$$(SELECTORS.dmMessage);
          const recentMessages = [];
          const maxMsg = Math.min(messages.length, 3);
          for (let j = 0; j < maxMsg; j++) {
            const msgText = await page.evaluate(el => el.textContent.trim(), messages[j]);
            if (msgText) recentMessages.push(msgText);
          }

          await page.goBack({ waitUntil: 'domcontentloaded' });
          await sleep(2000);
        }
      } catch (err) {
        console.log(`📸 Error reading DM ${i}:`, err.message);
      }
    }

    const summary = unreadCount > 0
      ? `You have ${unreadCount} unread DM${unreadCount > 1 ? 's' : ''} in your inbox.\n\nRecent conversations:\n${dms.slice(0, 3).join('\n')}`
      : `No unread DMs. Recent conversations:\n${dms.slice(0, 3).join('\n')}`;

    console.log(`📸 DMs checked: ${dms.length} conversations, ${unreadCount} unread`);
    return { success: true, message: summary };

  } catch (err) {
    console.error('❌ Instagram error:', err.message);
    return { success: false, error: `Instagram check failed: ${err.message}` };
  }
}

async function checkLoggedIn(page) {
  try {
    await page.waitForSelector('a[href="/direct/inbox/"]', { timeout: 15000 });
    return true;
  } catch {
    try {
      await page.waitForSelector('button[type="submit"]', { timeout: 5000 });
      return false;
    } catch {
      return false;
    }
  }
}

module.exports = { checkInstagramDMs };
