const { app, BrowserWindow, screen, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { askVishal, clearMemory } = require('./agents/claude-brain');
const githubWatcher = require('./agents/github-watcher');
const githubActions = require('./agents/github-actions');

let mainWindow;
let screenWidth, screenHeight;

// ===== SETTINGS PERSISTENCE =====
const settingsPath = path.join(app.getPath('userData'), 'vishal-settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return {
    position: { x: null, y: null },
    snoozedUntil: null
  };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('💾 Settings saved');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

let appSettings = loadSettings();
console.log('📁 Settings path:', settingsPath);
console.log('📦 Loaded settings:', appSettings);

// ===== CREATE WINDOW =====
function createWindow() {
  const display = screen.getPrimaryDisplay().workAreaSize;
  screenWidth = display.width;
  screenHeight = display.height;

  console.log('Creating fullscreen transparent window:', screenWidth, 'x', screenHeight);

  mainWindow = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile('renderer/index.html');
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ===== IPC HANDLERS =====

// Existing: Vishal finished his task
ipcMain.on('summon-done', () => {
  console.log('>> Vishal finished — restoring click-through');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

// Existing: Get screen size
ipcMain.handle('get-screen-size', () => {
  return { width: screenWidth, height: screenHeight };
});

// Existing: Chat with Vishal (Claude/Groq brain)
ipcMain.handle('ask-vishal', async (event, userMessage) => {
  console.log('>> User asked:', userMessage);
  const result = await askVishal(userMessage);
  console.log('>> Vishal replied:', result.response);
  console.log('>> Source:', result.source);
  return result;
});

// Existing: Clear conversation memory
ipcMain.on('clear-memory', () => {
  clearMemory();
});

// Existing: GitHub — open URL
ipcMain.handle('github-open-url', async (event, url) => {
  return githubActions.openInBrowser(url);
});

// Existing: GitHub — approve PR
ipcMain.handle('github-approve-pr', async (event, { owner, repo, prNumber }) => {
  return await githubActions.approvePR(owner, repo, prNumber);
});

// Existing: GitHub — get summary
ipcMain.handle('github-get-summary', async () => {
  return await githubWatcher.getGitHubSummary();
});

// NEW: Save Vishal's position when dragged
ipcMain.on('save-position', (event, position) => {
  appSettings.position = position;
  saveSettings(appSettings);
  console.log('📍 Position saved:', position);
});

// NEW: Get saved position on startup
ipcMain.handle('get-position', () => {
  return appSettings.position;
});

// NEW: Snooze Vishal (don't show notifications for X minutes)
ipcMain.on('snooze-vishal', (event, minutes) => {
  appSettings.snoozedUntil = Date.now() + (minutes * 60 * 1000);
  saveSettings(appSettings);
  console.log(`😴 Vishal snoozed for ${minutes} minutes`);
});

// NEW: Quit Vishal cleanly
ipcMain.on('quit-vishal', () => {
  console.log('👋 Goodbye, boss!');
  app.quit();
});

// ===== SUMMON FUNCTIONS =====

function summonVishal(message, buttons) {
  console.log('>> Summoning Vishal:', message);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.webContents.send('summon-vishal', { message, buttons });
}

// UPDATED: Respects snooze setting
function summonVishalForGitHubEvent(event) {
  // Check if snoozed
  if (appSettings.snoozedUntil && Date.now() < appSettings.snoozedUntil) {
    const minsLeft = Math.ceil((appSettings.snoozedUntil - Date.now()) / 60000);
    console.log(`😴 Vishal snoozed for ${minsLeft} more min — skipping event`);
    return;
  }
  
  console.log('>> Summoning Vishal for GitHub event:', event.title);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.webContents.send('github-event', event);
}

// ===== APP STARTUP =====

app.whenReady().then(async () => {
  createWindow();

  // Hotkey: Ctrl+Alt+V — chat with Vishal
  const chatHotkey = globalShortcut.register('CommandOrControl+Alt+V', () => {
    console.log('>>> CHAT HOTKEY PRESSED <<<');
    summonVishal("Hey boss! What can I help with?", []);
  });
  if (chatHotkey) console.log('OK Hotkey Ctrl+Alt+V registered (chat)');

  // Hotkey: Ctrl+Alt+G — GitHub summary
  const ghHotkey = globalShortcut.register('CommandOrControl+Alt+G', async () => {
    console.log('>>> GITHUB HOTKEY PRESSED <<<');
    const summary = await githubWatcher.getGitHubSummary();
    
    const message = `📊 GitHub Status:
• PRs needing review: ${summary.prsNeedingReview}
• Issues assigned: ${summary.issuesAssigned}
• Mentions: ${summary.mentions}
• Build failures (24h): ${summary.buildFailures}`;
    
    summonVishalForGitHubEvent({
      type: 'summary',
      priority: 'info',
      title: 'GitHub Summary',
      message: message,
      actions: ['Open GitHub', 'Done']
    });
  });
  if (ghHotkey) console.log('OK Hotkey Ctrl+Alt+G registered (github)');

  // Verify GitHub connection
  const ghStatus = await githubWatcher.verifyConnection();
  
  if (ghStatus.success) {
    // Start GitHub watcher
    githubWatcher.startWatcher((event) => {
      console.log('🚨 New GitHub event:', event.title);
      summonVishalForGitHubEvent(event);
    });
  } else {
    console.error('❌ Skipping GitHub watcher — connection failed');
  }

  // AUTO-TEST: greet user after 5 seconds
  setTimeout(() => {
    console.log('=== STARTUP GREETING ===');
    summonVishal(
      `Hey boss! I'm connected to GitHub @${process.env.GITHUB_USERNAME}. Press Ctrl+Alt+G for status, Ctrl+Alt+V to chat!`,
      []
    );
  }, 5000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  githubWatcher.stopWatcher();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});