const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload: starting');

try {
  contextBridge.exposeInMainWorld('vishalAPI', {
    // Chat
    onSummon: (callback) => ipcRenderer.on('summon-vishal', (event, data) => callback(data)),
    summonDone: () => ipcRenderer.send('summon-done'),
    getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
    askVishal: (message) => ipcRenderer.invoke('ask-vishal', message),
    clearMemory: () => ipcRenderer.send('clear-memory'),
    
    // GitHub
    onGitHubEvent: (callback) => ipcRenderer.on('github-event', (event, data) => callback(data)),
    githubOpenUrl: (url) => ipcRenderer.invoke('github-open-url', url),
    githubApprovePR: (params) => ipcRenderer.invoke('github-approve-pr', params),
    githubGetSummary: () => ipcRenderer.invoke('github-get-summary'),
    
    // NEW: Position memory
    savePosition: (position) => ipcRenderer.send('save-position', position),
    getPosition: () => ipcRenderer.invoke('get-position'),
    
    // NEW: Snooze
    snoozeVishal: (minutes) => ipcRenderer.send('snooze-vishal', minutes),
    
    // NEW: Quit
    quitVishal: () => ipcRenderer.send('quit-vishal')
  });
  console.log('Preload: vishalAPI exposed successfully');
} catch (err) {
  console.error('Preload: Failed to expose vishalAPI:', err);
}