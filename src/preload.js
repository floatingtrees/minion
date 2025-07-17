const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserAPI', {
    log: (msg) => ipcRenderer.send('renderer-log', msg),
    newTab: () => ipcRenderer.invoke('tabs:new'),
    activateTab: i => ipcRenderer.invoke('tabs:activate', i),
    closeTab: i => ipcRenderer.invoke('tabs:close', i),
    navigate: q => ipcRenderer.invoke('omnibox:navigate', q),
    goBack: () => ipcRenderer.invoke('navigation:back'),
    goForward: () => ipcRenderer.invoke('navigation:forward'),
    takeScreenshot: () => ipcRenderer.invoke('page:screenshot'),
    leftClick: (x, y) => ipcRenderer.invoke('automation:leftClick', x, y),
    toggleSidebar: (isVisible) => ipcRenderer.send('sidebar:toggle', isVisible),
    onTitle: fn => ipcRenderer.on('tab:title', (_, ...args) => fn(...args)),
    onUrlChange: fn => ipcRenderer.on('tab:url', (_, ...args) => fn(...args)),
    onTabCreated: fn => ipcRenderer.on('tab-created', (_, tabData) => fn(tabData)),
    onTabClosed: fn => ipcRenderer.on('tab-closed', (_, ...args) => fn(...args)),
    onTabSwitched: fn => ipcRenderer.on('tab-switched', (_, ...args) => fn(...args)),
    onSidebarToggle: fn => ipcRenderer.on('sidebar:toggle', (_, isVisible) => fn(isVisible)),
});
