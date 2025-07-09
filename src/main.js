const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const path = require('node:path');

const PARTITION = 'persist:main';           // shared session survives restarts
let win, views = [], active = 0;

/* ───────── create window + first tab ───────── */
app.whenReady().then(() => {
    win = new BrowserWindow({
        width: 1280, height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
    win.loadFile(path.join(__dirname, 'renderer.html'));
    addTab('https://www.google.com');         // first real web page
    win.on('resize', layoutViews);
});

/* ───────── tab helpers ───────── */
function addTab(url) {
    const view = new BrowserView({
        webPreferences: { partition: PARTITION }
    });
    views.push(view);
    active = views.length - 1;
    win.setBrowserView(view);
    layoutViews();
    view.webContents.loadURL(url);
}

function layoutViews() {
    const [w, h] = win.getContentSize();
    // Reserve 48 px for tabstrip + omnibox
    views.forEach(v => v.setBounds({ x: 0, y: 48, width: w, height: h - 48 }));
}

/* ───────── IPC handlers ───────── */
ipcMain.handle('tabs:new', () => addTab('https://google.com'));

ipcMain.handle('tabs:activate', (_e, idx) => {
    if (!views[idx]) return;
    active = idx;
    win.setBrowserView(views[idx]);
    layoutViews();
});

ipcMain.handle('tabs:close', (_e, idx) => {
    if (views.length === 1) return;           // keep at least one tab open
    views[idx].destroy();
    views.splice(idx, 1);
    active = Math.max(0, active - (idx <= active ? 1 : 0));
    win.setBrowserView(views[active]);
    layoutViews();
});

ipcMain.handle('omnibox:navigate', (_e, raw) => {
    const url = /^(https?:\/\/|file:)/i.test(raw)
        ? raw
        : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
    views[active].webContents.loadURL(url);
});
