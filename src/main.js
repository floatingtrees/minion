const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

const PARTITION = 'persist:main';
const H = 800, W = 1280;

let win;
let currentTabId = 1;
let tabs = new Map();

app.whenReady().then(() => {
    win = new BrowserWindow({
        width: W, height: H,
        show: true,
        webPreferences: {
            partition: PARTITION,
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true
        }
    });

    // Load our custom browser interface
    win.loadFile(path.join(__dirname, 'browser.html'));

    // Handle IPC messages from the renderer
    ipcMain.handle('create-tab', async () => {
        currentTabId++;
        return currentTabId;
    });

    ipcMain.handle('close-tab', async (event, tabId) => {
        tabs.delete(tabId);
        return Array.from(tabs.keys());
    });

    // Optional: Set frame rate for performance
    win.webContents.setFrameRate(60);
});

/* ---------- quit housekeeping (flush IndexedDB etc.) ------------ */
app.on('before-quit', async () => {
    const ses = win?.webContents.session;
    if (ses) await ses.flushStorageData();
});
