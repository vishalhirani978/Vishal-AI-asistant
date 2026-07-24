const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload: starting');

try {
  contextBridge.exposeInMainWorld('vishalAPI', {

    // ===== MOUSE PASSTHROUGH =====
    vishalActive: () => ipcRenderer.send('vishal-active'),
    vishalIdle: () => ipcRenderer.send('vishal-idle'),

    // ===== STARTUP =====
    onStartupGreeting: (callback) =>
      ipcRenderer.on('startup-greeting', (event, data) => callback(data)),

    // ===== CHAT =====
    onSummon: (callback) =>
      ipcRenderer.on('summon-vishal', (event, data) => callback(data)),
    summonDone: () => ipcRenderer.send('summon-done'),
    getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
    askVishal: (message) => ipcRenderer.invoke('ask-vishal', message),
    agentParse: (text) => ipcRenderer.invoke('agent-parse', text),
    agentExecute: (toolName, params) => ipcRenderer.invoke('agent-execute', toolName, params),
    clearMemory: () => ipcRenderer.send('clear-memory'),

    // ===== WHISPER TRANSCRIPTION =====
    transcribeAudio: (audioData, mimeType) =>
      ipcRenderer.invoke('transcribe-audio', { audioData, mimeType }),

    // ===== SCREEN AWARENESS =====
    captureScreen: () => ipcRenderer.invoke('capture-screen'),

    // ===== GITHUB =====
    onGitHubEvent: (callback) =>
      ipcRenderer.on('github-event', (event, data) => callback(data)),
    githubOpenUrl: (url) => ipcRenderer.invoke('github-open-url', url),
    githubApprovePR: (params) => ipcRenderer.invoke('github-approve-pr', params),
    githubGetSummary: () => ipcRenderer.invoke('github-get-summary'),

    // ===== POSITION MEMORY =====
    savePosition: (position) => ipcRenderer.send('save-position', position),
    getPosition: () => ipcRenderer.invoke('get-position'),

    // ===== SNOOZE =====
    snoozeVishal: (minutes) => ipcRenderer.send('snooze-vishal', minutes),

    // ===== CONTEXT MENU =====
    showContextMenu: (x, y) => ipcRenderer.send('show-context-menu', { x, y }),
    onContextMenuAction: (callback) =>
      ipcRenderer.on('context-menu-action', (event, action) => callback(action)),

    // ===== SETTINGS =====
    openSettings: () => ipcRenderer.send('open-settings'),
    loadSettings: () => ipcRenderer.invoke('settings-load'),
    onSettingsChanged: (callback) =>
      ipcRenderer.on('settings-changed', (event, settings) => callback(settings)),

    // ===== VOICE INPUT =====
    onStartVoiceInput: (callback) =>
      ipcRenderer.on('start-voice-input', () => callback()),

    // ===== CONTACTS =====
    contactsGetAll: () => ipcRenderer.invoke('contacts-get-all'),
    contactsAdd: (name, phone, email) => ipcRenderer.invoke('contacts-add', { name, phone, email }),
    contactsRemove: (name) => ipcRenderer.invoke('contacts-remove', name),
    contactsLookup: (name) => ipcRenderer.invoke('contacts-lookup', name),

    // ===== QUIT =====
    quitVishal: () => ipcRenderer.send('quit-vishal'),

  });
  console.log('Preload: vishalAPI exposed successfully');
} catch (err) {
  console.error('Preload: Failed to expose vishalAPI:', err);
}