const { app, BrowserWindow, screen, globalShortcut, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { askVishal, clearMemory } = require('./agents/claude-brain');
const githubWatcher = require('./agents/github-watcher');
const githubActions = require('./agents/github-actions');
const { transcribeAudio } = require('./agents/whisper');
const { parseIntent } = require('./agents/agent-brain');
const { findTool } = require('./agents/agent-tools');
const { buildConfirmation, executeConfirmed } = require('./agents/agent-executor');
const contacts = require('./agents/contacts');

let mainWindow;
let settingsWindow = null;
let screenWidth, screenHeight;

// ===== SETTINGS PERSISTENCE =====
const settingsPath = path.join(app.getPath('userData'), 'vishal-settings.json');

const DEFAULT_SETTINGS = {
  position: { x: null, y: null },
  snoozedUntil: null,
  personality: 'friendly',
  charScale: '1.0',
  chatHotkey: 'CommandOrControl+Alt+V',
  githubHotkey: 'CommandOrControl+Alt+G',
  voiceHotkey: 'CommandOrControl+Alt+Space',
  githubEnabled: true,
  githubInterval: 60,
  githubUsername: process.env.GITHUB_USERNAME || '',
  notifyPR: true,
  notifyIssues: true,
  notifyMentions: true,
  notifyBuilds: true,
  autoStart: false,
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const saved = JSON.parse(data);
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
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
console.log('📦 Loaded settings:', JSON.stringify(appSettings, null, 2));

// ===== CREATE MAIN WINDOW =====
function createWindow() {
  const display = screen.getPrimaryDisplay().workAreaSize;
  screenWidth = display.width;
  screenHeight = display.height;

  console.log('Creating fullscreen transparent window:', screenWidth, 'x', screenHeight);

  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const iconExists = fs.existsSync(iconPath);

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
    ...(iconExists ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // ✅ AUTO-GRANT MICROPHONE PERMISSION
  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      console.log('🔐 Permission requested:', permission);
      if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
        callback(true);
      } else {
        callback(false);
      }
    }
  );

  mainWindow.webContents.session.setPermissionCheckHandler(
    (webContents, permission) => {
      if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
        return true;
      }
      return false;
    }
  );

  mainWindow.loadFile('renderer/index.html');

  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// ===== OPEN SETTINGS WINDOW =====
function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const iconExists = fs.existsSync(iconPath);

  settingsWindow = new BrowserWindow({
    width: 680,
    height: 820,
    title: 'Pixel PM — Settings',
    autoHideMenuBar: true,
    resizable: true,
    minWidth: 500,
    minHeight: 600,
    ...(iconExists ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ===== REGISTER HOTKEYS =====
function registerHotkeys() {
  globalShortcut.unregisterAll();

  const chatKey = appSettings.chatHotkey || 'CommandOrControl+Alt+V';
  const ghKey = appSettings.githubHotkey || 'CommandOrControl+Alt+G';
  const voiceKey = appSettings.voiceHotkey || 'CommandOrControl+Alt+Space';

  const chatOk = globalShortcut.register(chatKey, () => {
    console.log('>>> CHAT HOTKEY PRESSED <<<');
    summonVishal("Hey boss! What can I help with?", []);
  });
  console.log(`Hotkey ${chatKey} registered:`, chatOk);

  const ghOk = globalShortcut.register(ghKey, async () => {
    console.log('>>> GITHUB HOTKEY PRESSED <<<');
    const summary = await githubWatcher.getGitHubSummary();

    const message =
      `📊 GitHub Status:\n` +
      `• PRs needing review: ${summary.prsNeedingReview}\n` +
      `• Issues assigned: ${summary.issuesAssigned}\n` +
      `• Mentions: ${summary.mentions}\n` +
      `• Build failures (24h): ${summary.buildFailures}`;

    summonVishalForGitHubEvent({
      type: 'summary',
      priority: 'info',
      title: 'GitHub Summary',
      message,
      url: `https://github.com/${process.env.GITHUB_USERNAME}`,
      actions: ['Open GitHub', 'Done'],
    });
  });
  console.log(`Hotkey ${ghKey} registered:`, ghOk);

  // ===== VOICE INPUT HOTKEY =====
  const voiceOk = globalShortcut.register(voiceKey, () => {
    console.log('>>> VOICE HOTKEY PRESSED <<<');
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.webContents.send('start-voice-input');
    }
  });
  console.log(`Hotkey ${voiceKey} registered:`, voiceOk);
}

// ===== IPC: CORE =====

ipcMain.on('summon-done', () => {
  console.log('>> Vishal home — restoring click-through');
  if (mainWindow) mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

ipcMain.handle('get-screen-size', () => {
  return { width: screenWidth, height: screenHeight };
});

ipcMain.handle('ask-vishal', async (event, userMessage) => {
  console.log('>> User asked:', userMessage);
  const result = await askVishal(userMessage);
  console.log('>> Vishal replied:', result.response, '| Source:', result.source);
  return result;
});

// ===== IPC: AGENT BRAIN =====

ipcMain.handle('agent-parse', async (event, userMessage) => {
  console.log('🧠 Agent parsing:', userMessage);
  const intent = await parseIntent(userMessage);
  console.log('🧠 Parsed intent:', JSON.stringify(intent));

  if (intent.action === 'chat') {
    const result = await askVishal(userMessage);
    return {
      type: 'chat',
      response: result.response,
      source: result.source,
      intent,
    };
  }

  const tool = findTool(intent.action);
  if (!tool) {
    return {
      type: 'chat',
      response: `Sorry boss, I don't know how to do that yet.`,
      source: 'agent',
      intent,
    };
  }

  const confirmation = buildConfirmation(intent.action, intent.params);
  return {
    type: 'confirmation',
    confirmation,
    intent,
  };
});

ipcMain.handle('agent-execute', async (event, toolName, params) => {
  console.log('🎬 Agent execute:', toolName, JSON.stringify(params));
  const result = await executeConfirmed(toolName, params);
  return result;
});

ipcMain.on('clear-memory', () => {
  clearMemory();
});

// ===== IPC: WHISPER TRANSCRIPTION =====
ipcMain.handle('transcribe-audio', async (event, { audioData, mimeType }) => {
  try {
    console.log('🎤 Received audio for transcription:', audioData.byteLength, 'bytes');
    const buffer = Buffer.from(audioData);
    const result = await transcribeAudio(buffer, mimeType);
    return result;
  } catch (err) {
    console.error('❌ Transcribe handler error:', err);
    return { success: false, error: err.message };
  }
});

// ===== IPC: GITHUB =====

ipcMain.handle('github-open-url', async (event, url) => {
  return githubActions.openInBrowser(url);
});

ipcMain.handle('github-approve-pr', async (event, { owner, repo, prNumber }) => {
  return await githubActions.approvePR(owner, repo, prNumber);
});

ipcMain.handle('github-get-summary', async () => {
  return await githubWatcher.getGitHubSummary();
});

// ===== IPC: CONTACTS =====

ipcMain.handle('contacts-get-all', () => {
  return contacts.getAllContacts();
});

ipcMain.handle('contacts-add', async (event, { name, phone, email }) => {
  return contacts.addContact(name, phone, email);
});

ipcMain.handle('contacts-remove', async (event, name) => {
  return contacts.removeContact(name);
});

ipcMain.handle('contacts-lookup', async (event, name) => {
  return contacts.resolveRecipient(name);
});

// ===== IPC: POSITION =====

ipcMain.on('save-position', (event, position) => {
  appSettings.position = position;
  saveSettings(appSettings);
  console.log('📍 Position saved:', position);
});

ipcMain.handle('get-position', () => {
  return appSettings.position;
});

// ===== IPC: SNOOZE =====

ipcMain.on('snooze-vishal', (event, minutes) => {
  appSettings.snoozedUntil = Date.now() + minutes * 60 * 1000;
  saveSettings(appSettings);
  console.log(`😴 Vishal snoozed for ${minutes} minutes`);
});

// ===== IPC: MOUSE PASSTHROUGH =====

ipcMain.on('vishal-active', () => {
  console.log('>> Vishal active — disabling click-through');
  if (mainWindow) mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('vishal-idle', () => {
  console.log('>> Vishal idle — restoring click-through');
  if (mainWindow) mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

// ===== IPC: CONTEXT MENU =====

ipcMain.on('show-context-menu', (event, { x, y }) => {
  const snoozedUntil = appSettings.snoozedUntil;
  const isSnoozed = snoozedUntil && Date.now() < snoozedUntil;
  const minsLeft = isSnoozed
    ? Math.ceil((snoozedUntil - Date.now()) / 60000)
    : 0;

  const template = [
    {
      label: '💬 Chat with Vishal',
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'chat');
      },
    },
    {
      label: '🐙 GitHub Status',
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'github-status');
      },
    },
    { type: 'separator' },
    {
      label: isSnoozed
        ? `😴 Snoozed (${minsLeft}m left) — Click to unsnooze`
        : '😴 Snooze 30 minutes',
      click: () => {
        if (isSnoozed) {
          appSettings.snoozedUntil = null;
          saveSettings(appSettings);
          console.log('🔔 Unsnoozed');
        } else {
          appSettings.snoozedUntil = Date.now() + 30 * 60 * 1000;
          saveSettings(appSettings);
          console.log('😴 Snoozed 30 min');
        }
      },
    },
    ...(!isSnoozed
      ? [
          {
            label: '😴 Snooze 1 hour',
            click: () => {
              appSettings.snoozedUntil = Date.now() + 60 * 60 * 1000;
              saveSettings(appSettings);
              console.log('😴 Snoozed 1 hour');
            },
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: '⚙️ Settings',
      click: () => openSettings(),
    },
    { type: 'separator' },
    {
      label: '👋 Quit Pixel PM',
      click: () => {
        mainWindow.webContents.send('context-menu-action', 'quit');
      },
    },
    { type: 'separator' },
    {
      label: 'Pixel PM v1.0.0',
      enabled: false,
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow, x, y });
});

// ===== IPC: SETTINGS =====

ipcMain.on('open-settings', () => {
  openSettings();
});

ipcMain.handle('settings-load', () => {
  return appSettings;
});

ipcMain.handle('settings-save', async (event, newSettings) => {
  try {
    appSettings = { ...appSettings, ...newSettings };
    saveSettings(appSettings);

    app.setLoginItemSettings({
      openAtLogin: !!appSettings.autoStart,
      path: process.execPath,
    });

    registerHotkeys();

    if (mainWindow) {
      mainWindow.webContents.send('settings-changed', appSettings);
    }

    return { success: true };
  } catch (err) {
    console.error('settings-save error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('settings-get-path', () => {
  return settingsPath;
});

ipcMain.on('settings-close', () => {
  if (settingsWindow) settingsWindow.close();
});

// ===== IPC: QUIT =====

ipcMain.on('quit-vishal', () => {
  console.log('👋 Goodbye, boss!');
  app.quit();
});

// ===== SUMMON HELPERS =====

function summonVishal(message, buttons) {
  console.log('>> Summoning Vishal (chat):', message);
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send('summon-vishal', { message, buttons });
  }
}

function summonVishalForGitHubEvent(event) {
  if (appSettings.snoozedUntil && Date.now() < appSettings.snoozedUntil) {
    const minsLeft = Math.ceil((appSettings.snoozedUntil - Date.now()) / 60000);
    console.log(`😴 Snoozed (${minsLeft}m left) — skipping: ${event.title}`);
    return;
  }

  if (event.type === 'pr-review' && !appSettings.notifyPR) return;
  if (event.type === 'issue-assigned' && !appSettings.notifyIssues) return;
  if (event.type === 'mention' && !appSettings.notifyMentions) return;
  if (event.type === 'build-failure' && !appSettings.notifyBuilds) return;

  console.log('>> Summoning Vishal (GitHub event):', event.title);
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.webContents.send('github-event', event);
  }
}

// ===== APP STARTUP =====

app.whenReady().then(async () => {
  createWindow();

  registerHotkeys();

  app.setLoginItemSettings({
    openAtLogin: !!appSettings.autoStart,
    path: process.execPath,
  });

  const ghStatus = await githubWatcher.verifyConnection();

  if (ghStatus.success) {
    githubWatcher.startWatcher((event) => {
      console.log('🚨 New GitHub event:', event.title);
      summonVishalForGitHubEvent(event);
    });
  } else {
    console.error('❌ Skipping GitHub watcher — connection failed');
  }

  setTimeout(() => {
    console.log('=== STARTUP GREETING ===');
    const username = process.env.GITHUB_USERNAME || 'you';
    if (mainWindow) {
      mainWindow.webContents.send('startup-greeting', {
        connected: ghStatus.success,
        username,
      });
    }
  }, 3000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  githubWatcher.stopWatcher();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});