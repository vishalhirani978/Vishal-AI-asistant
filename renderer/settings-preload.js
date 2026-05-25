const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  load: () => ipcRenderer.invoke('settings-load'),
  save: (settings) => ipcRenderer.invoke('settings-save', settings),
  close: () => ipcRenderer.send('settings-close'),
  getPath: () => ipcRenderer.invoke('settings-get-path'),
});