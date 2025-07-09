const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
    newTab: () => ipcRenderer.invoke('tabs:new'),
    activateTab: i => ipcRenderer.invoke('tabs:activate', i),
    closeTab: i => ipcRenderer.invoke('tabs:close', i),
    navigate: q => ipcRenderer.invoke('omnibox:navigate', q),
    onTitle: fn => ipcRenderer.on('tab:title', (_, ...args) => fn(...args))
});
