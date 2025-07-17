const { app, BrowserWindow, WebContentsView, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
// Adblocker imports
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fetch = require('cross-fetch');

const PARTITION = 'persist:main';           // shared session survives restarts
let win, views = [], active = 0, sidebarVisible = false;

// Initialize adblocker before any windows are created
let blockerReady = false;
let blocker = null;
ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((b) => {
    blocker = b;
    blockerReady = true;
    // Only enable on default session initially, partition session will be enabled when first tab is created
    try {
        // Increase max listeners for sessions to handle ad blocker listeners
        session.defaultSession.setMaxListeners(50);
        session.fromPartition(PARTITION).setMaxListeners(50);

        blocker.enableBlockingInSession(session.defaultSession);
        console.log('Adblocker enabled for default session.');
    } catch (error) {
        console.warn('Could not enable ad blocking on default session:', error.message);
    }
});

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
                        if (views.length > 1 && views[active]) {
                            closeTab(views[active].webContents.id);
                        } else if (views.length === 1) {
                            // Close the entire application when only 1 tab is left
                            app.quit();
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
                { type: 'separator' },
                {
                    label: 'Toggle Sidebar',
                    accelerator: 'CmdOrCtrl+Shift+A',
                    click: () => {
                        sidebarVisible = !sidebarVisible;
                        win.webContents.send('sidebar:toggle', sidebarVisible);
                        layoutViews();
                    }
                }
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
        width: 1280, height: 800, resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false
        }
    });

    // Increase max listeners to prevent warnings during development
    win.setMaxListeners(20);

    createAppMenu();

    win.loadFile(path.join(__dirname, 'renderer.html'));

    // Wait for renderer to be ready, then add the initial tab
    win.webContents.once('did-finish-load', () => {
        addTab('https://www.google.com', true);  // notify renderer about initial tab
    });

    win.on('resize', layoutViews);
});

/* ───────── tab helpers ───────── */
function addTab(url, notifyRenderer = false) {
    const view = new WebContentsView({
        webPreferences: { partition: PARTITION }
    });
    views.push(view);
    const [w, h] = win.getSize();
    console.log(`frame size = ${w} × ${h}`);
    const tabIndex = views.length - 1;
    active = tabIndex;
    win.contentView.addChildView(view);
    // Hide all other views and show only the new one
    views.forEach((v, i) => v.setVisible(i === tabIndex));
    layoutViews();

    // Store listener references so we can remove them later
    const titleListener = (event, title) => {
        win.webContents.send('tab:title', tabIndex, title);
    };

    const loadListener = () => {
        const title = view.webContents.getTitle();
        const url = view.webContents.getURL();
        if (title && title !== '') {
            win.webContents.send('tab:title', tabIndex, title);
        }
        if (url && url !== '') {
            win.webContents.send('tab:url', tabIndex, url);
        }
    };

    const inputListener = (event, input) => {
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
    };

    // Store listeners on the view object for cleanup
    view._listeners = {
        title: titleListener,
        load: loadListener,
        input: inputListener
    };

    // Add listeners
    view.webContents.on('page-title-updated', titleListener);
    view.webContents.on('did-finish-load', loadListener);
    view.webContents.on('before-input-event', inputListener);

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
        win.webContents.send('tab-created', { id: view.webContents.id, url: url });
    }
}

function switchToTab(idx) {
    if (views[idx]) {
        active = idx;
        // Hide all views first
        views.forEach(view => view.setVisible(false));
        // Show the active view
        views[idx].setVisible(true);
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
            // Remove event listeners to prevent memory leaks
            if (views[tabIndex]._listeners) {
                views[tabIndex].webContents.removeListener('page-title-updated', views[tabIndex]._listeners.title);
                views[tabIndex].webContents.removeListener('did-finish-load', views[tabIndex]._listeners.load);
                views[tabIndex].webContents.removeListener('before-input-event', views[tabIndex]._listeners.input);
            }

            // Remove the view from the window
            win.contentView.removeChildView(views[tabIndex]);
        } catch (error) {
            console.error('Error removing view:', error);
        }
    }
    views.splice(tabIndex, 1);

    const newActiveTabIndex = Math.max(0, active - (tabIndex <= active ? 1 : 0));
    active = newActiveTabIndex;

    if (views.length > 0) {
        views.forEach(view => view.setVisible(false));
        views[active].setVisible(true);
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
    addTab('https://www.google.com', true);
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
    let url;
    const input = raw.trim();

    // Check if it's a URL (improved detection)
    if (/^https?:\/\//i.test(input)) {
        // Already has protocol
        url = input;
    } else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(input)) {
        // Looks like a domain (e.g., "google.com", "example.org")
        url = `https://${input}`;
    } else if (/^localhost(:\d+)?/i.test(input)) {
        // Localhost with optional port
        url = `http://${input}`;
    } else {
        // Search query
        url = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
    }

    // Immediately update the omnibox to show the detected URL
    win.webContents.send('tab:url', active, url);

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

ipcMain.on('renderer-log', (event, message) => {
    console.log(`[Renderer] ${message}`);
});
ipcMain.handle('page:screenshot', async () => {
    const image = await views[active].webContents.capturePage();
    const pngBuffer = image.toPNG();
    const base64 = pngBuffer.toString('base64');
    return base64; // Returned to renderer
});

ipcMain.handle('automation:leftClick', async (event, x, y) => {
    if (views[active] && views[active].webContents) {
        try {
            // Send a mouse click event to the active tab's webContents
            await views[active].webContents.sendInputEvent({
                type: 'mouseDown',
                button: 'left',
                x: x,
                y: y
            });

            await views[active].webContents.sendInputEvent({
                type: 'mouseUp',
                button: 'left',
                x: x,
                y: y
            });

            console.log(`Left click sent to coordinates (${x}, ${y})`);
            return true;
        } catch (error) {
            console.error('Error sending left click:', error);
            return false;
        }
    } else {
        console.error('No active tab to send click to');
        return false;
    }
});