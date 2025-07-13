const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
    newTab: () => ipcRenderer.invoke('tabs:new'),
    activateTab: i => ipcRenderer.invoke('tabs:activate', i),
    closeTab: i => ipcRenderer.invoke('tabs:close', i),
    navigate: q => ipcRenderer.invoke('omnibox:navigate', q),
    goBack: () => ipcRenderer.invoke('navigation:back'),
    goForward: () => ipcRenderer.invoke('navigation:forward'),
    takeScreenshot: () => ipcRenderer.invoke('page:screenshot'),
    toggleSidebar: (isVisible) => ipcRenderer.send('sidebar:toggle', isVisible),
    onTitle: fn => ipcRenderer.on('tab:title', (_, ...args) => fn(...args)),
    onTabCreated: fn => ipcRenderer.on('tab-created', (_, tabData) => fn(tabData)),
    onTabClosed: fn => ipcRenderer.on('tab-closed', (_, ...args) => fn(...args)),
    onTabSwitched: fn => ipcRenderer.on('tab-switched', (_, ...args) => fn(...args)),
});
