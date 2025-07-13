const { app, BrowserWindow, BrowserView, ipcMain, Menu } = require('electron');
const path = require('node:path');

const PARTITION = 'persist:main';           // shared session survives restarts
let win, views = [], active = 0, sidebarVisible = false;

/* ───────── app menu ───────── */
function createAppMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Tab',
                    accelerator: 'CmdOrCtrl+T',
                    click: () => addTab('https://google.com', true)
                },
                { type: 'separator' },
                {
                    label: 'Close Tab',
                    accelerator: 'CmdOrCtrl+W',
                    click: () => {
                        if (views.length > 0 && views[active]) {
                            closeTab(views[active].webContents.id);
                        } else {
                        }
                    }
                }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
            ]
        },
        {
            label: 'Window',
            submenu: [
                ...Array.from({ length: 9 }, (_, i) => ({
                    label: `Switch to Tab ${i + 1}`,
                    accelerator: `CmdOrCtrl+${i + 1}`,
                    click: () => switchToTab(i)
                })),
                {
                    label: 'Switch to Last Tab',
                    accelerator: 'CmdOrCtrl+9',
                    click: () => switchToTab(views.length - 1)
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

/* ───────── create window + first tab ───────── */
app.whenReady().then(() => {
    win = new BrowserWindow({
        width: 1280, height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    createAppMenu();

    win.loadFile(path.join(__dirname, 'renderer.html'));
    addTab('https://www.google.com', true);         // first real web page
    win.on('resize', layoutViews);
});

/* ───────── tab helpers ───────── */
function addTab(url, notifyRenderer = false) {
    const view = new BrowserView({
        webPreferences: { partition: PARTITION }
    });
    views.push(view);
    const tabIndex = views.length - 1;
    active = tabIndex;
    win.setBrowserView(view);
    layoutViews();

    // Listen for title changes
    view.webContents.on('page-title-updated', (event, title) => {
        win.webContents.send('tab:title', tabIndex, title);
    });

    // Listen for page load completion to get initial title
    view.webContents.on('did-finish-load', () => {
        const title = view.webContents.getTitle();
        if (title && title !== '') {
            win.webContents.send('tab:title', tabIndex, title);
        }
    });

    // Handle back/forward shortcuts
    view.webContents.on('before-input-event', (event, input) => {
        if (input.meta || input.control) {
            if (input.key.toLowerCase() === 'arrowleft') {
                if (view.webContents.navigationHistory.canGoBack()) {
                    view.webContents.navigationHistory.goBack();
                }
                event.preventDefault();
            }
            if (input.key.toLowerCase() === 'arrowright') {
                if (view.webContents.navigationHistory.canGoForward()) {
                    view.webContents.navigationHistory.goForward();
                }
                event.preventDefault();
            }
        }
    });

    // Handle new window requests by redirecting to current tab
    view.webContents.setWindowOpenHandler(({ url }) => {
        if (url) {
            view.webContents.loadURL(url);
            // Set loading state
            win.webContents.send('tab:title', tabIndex, 'Loading...');
        }
        return { action: 'deny' }; // Prevent the new window from opening
    });

    view.webContents.loadURL(url);

    if (notifyRenderer) {
        win.webContents.send('tab-created', { id: view.webContents.id });
    }
}

function switchToTab(idx) {
    if (views[idx]) {
        active = idx;
        win.setBrowserView(views[idx]);
        win.webContents.send('tab-switched', { newActiveTabIndex: idx });
    }
}

function closeTab(idToClose) {
    if (views.length === 1) {
        return;
    }

    const tabIndex = views.findIndex(v => {
        try {
            return v && v.webContents && v.webContents.id === idToClose;
        } catch (error) {
            console.error('Error finding tab:', error);
            return false;
        }
    });
    if (tabIndex === -1) {
        return; // Tab not found, may have already been closed
    }

    // Remove view from window and clean up
    if (views[tabIndex]) {
        try {
            // Remove the view from the window
            win.removeBrowserView(views[tabIndex]);
        } catch (error) {
            console.error('Error removing view:', error);
        }
    }
    views.splice(tabIndex, 1);

    const newActiveTabIndex = Math.max(0, active - (tabIndex <= active ? 1 : 0));
    active = newActiveTabIndex;

    if (views.length > 0) {
        win.setBrowserView(views[active]);
    }

    win.webContents.send('tab-closed', { closedTabIndex: tabIndex, newActiveTabIndex });
}

function layoutViews() {
    const [w, h] = win.getContentSize();
    const viewWidth = sidebarVisible ? w - 300 : w;
    // Reserve 88px for tabstrip + navigation bar (40px + 48px)
    views.forEach(v => v.setBounds({ x: 0, y: 88, width: viewWidth, height: h - 88 }));
}

/* ───────── IPC handlers ───────── */
ipcMain.handle('tabs:new', (_e, idx) => {
    addTab('https://www.google.com', true)
});

ipcMain.handle('tabs:activate', (_e, idx) => {
    switchToTab(idx);
});

ipcMain.handle('tabs:close', (_e, idx) => {
    if (views[idx]) {
        closeTab(views[idx].webContents.id);
    }
});

ipcMain.handle('omnibox:navigate', (_e, raw) => {
    const url = /^(https?:\/\/|file:)/i.test(raw)
        ? raw
        : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
    views[active].webContents.loadURL(url);

    // Set a temporary title while loading
    win.webContents.send('tab:title', active, 'Loading...');
});

ipcMain.on('sidebar:toggle', (_e, isVisible) => {
    sidebarVisible = isVisible;
    layoutViews();
});

ipcMain.handle('navigation:back', () => {
    if (views[active] && views[active].webContents.navigationHistory.canGoBack()) {
        views[active].webContents.navigationHistory.goBack();
    }
});

ipcMain.handle('navigation:forward', () => {
    if (views[active] && views[active].webContents.navigationHistory.canGoForward()) {
        views[active].webContents.navigationHistory.goForward();
    }
});

ipcMain.handle('page:screenshot', async () => {
    if (views[active]) {
        try {
            const image = await views[active].webContents.capturePage();
            const { shell } = require('electron');
            const fs = require('fs');
            const os = require('os');

            // Save screenshot to desktop
            const screenshotPath = path.join(os.homedir(), 'Desktop', `screenshot-${Date.now()}.png`);
            fs.writeFileSync(screenshotPath, image.toPNG());

            // Show the file in finder/explorer
            shell.showItemInFolder(screenshotPath);

            return screenshotPath;
        } catch (error) {
            console.error('Screenshot failed:', error);
        }
    }
});
