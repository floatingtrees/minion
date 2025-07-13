const api = window.browserAPI;
const tabs = [];                        // store {id, title, url} for each tab
let activeTabIdx = 0;                   // track the currently active tab
const bar = document.getElementById('tabbar');
const omni = document.getElementById('omnibox');
const newTabBtn = document.getElementById('new-tab-button');
const backBtn = document.getElementById('back-button');
const forwardBtn = document.getElementById('forward-button');
const screenshotBtn = document.getElementById('screenshot-button');
const sidebarBtn = document.getElementById('sidebar-button');
const sidebar = document.getElementById('sidebar');
const wsInput = document.getElementById('websocket-url');
const connectBtn = document.getElementById('connect-button');
let sidebarVisible = false;

function redraw() {
    // Create tabs HTML with fixed width to prevent overflow
    const tabsHTML = tabs.map((t, i) => {
        const title = t.title || 'New Tab';
        // Truncate title if too long, but always keep the X visible
        const displayTitle = title.length > 15 ? title.substring(0, 12) + '...' : title;
        return `<button class="tab ${i === activeTabIdx ? 'active' : ''}" data-i="${i}" data-id="${t.id}" style="min-width: 80px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayTitle} <span class="close-x">✕</span></button>`;
    }).join('');

    // Preserve the new tab button by temporarily removing it, updating innerHTML, then re-adding it
    const newTabButton = bar.querySelector('#new-tab-button');
    bar.innerHTML = tabsHTML;
    bar.appendChild(newTabButton);

    // Update omnibox to show current tab's URL
    updateOmnibox();
}

function updateOmnibox() {
    if (tabs[activeTabIdx]) {
        omni.value = tabs[activeTabIdx].url || '';
    }
}

// Tab closing is handled by main process via IPC events
// The renderer just needs to respond to tab-closed events

/* ───────── events ───────── */
bar.addEventListener('click', e => {
    const tabButton = e.target.closest('.tab');
    if (!tabButton) return; // Click was not on a tab or its children

    const i = +tabButton.dataset.i;
    const id = +tabButton.dataset.id;

    if (e.target.classList.contains('close-x')) {
        api.closeTab(i);  // Pass index, not ID
    } else { // Click was on the tab button itself
        api.activateTab(i);
    }
});

newTabBtn.addEventListener('click', () => {
    api.newTab();
});

backBtn.addEventListener('click', () => {
    api.goBack();
});

forwardBtn.addEventListener('click', () => {
    api.goForward();
});

screenshotBtn.addEventListener('click', async () => {
    try {
        const screenshotPath = await api.takeScreenshot();
        if (screenshotPath) {
            console.log('Screenshot saved to:', screenshotPath);
            // You could show a notification here
        }
    } catch (error) {
        console.error('Screenshot failed:', error);
    }
});

sidebarBtn.addEventListener('click', () => {
    sidebarVisible = !sidebarVisible;
    sidebar.classList.toggle('sidebar-hidden');
    sidebar.classList.toggle('sidebar-visible');
    api.toggleSidebar(sidebarVisible);
});

omni.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        const input = e.target.value.trim();
        if (tabs[activeTabIdx]) {
            tabs[activeTabIdx].url = input;
        }
        api.navigate(input);
    }
});

// Update current tab's URL when user types in omnibox
omni.addEventListener('input', e => {
    if (tabs[activeTabIdx]) {
        tabs[activeTabIdx].url = e.target.value;
    }
});

// Select all text when omnibox is focused
omni.addEventListener('focus', () => {
    omni.select();
});

document.addEventListener('keydown', e => {

    // Add CMD+arrow navigation
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        api.goBack();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        api.goForward();
    }

    // CMD+L or CTRL+L to focus omnibox
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        omni.focus();
        omni.select();
    }

    // CMD+T or CTRL+T to create new tab
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't') {
        e.preventDefault();
        api.newTab();
    }
});

function connect() {
    const ws = new WebSocket(`ws://${wsInput.value}`);
    ws.onopen = () => console.log('Connected to websocket');
    ws.onclose = () => console.log('Disconnected from websocket');
    ws.onerror = (err) => console.error('Websocket error:', err);
}

if (wsInput && connectBtn) {
    wsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') connect();
    });
    connectBtn.addEventListener('click', connect);
}

/* ───────── update titles from main (optional) ───────── */
api.onTitle((idx, title) => {
    if (tabs[idx]) {
        tabs[idx].title = title;
    }
    redraw();
});

// Listen for URL changes to update the omnibox
api.onUrlChange((idx, url) => {
    if (tabs[idx]) {
        tabs[idx].url = url;
        // Update omnibox if this is the active tab
        if (idx === activeTabIdx) {
            omni.value = url;
        }
    }
});

api.onTabCreated((tabData) => {
    tabs.push({ id: tabData.id, title: 'New Tab', url: tabData.url || '' });
    activeTabIdx = tabs.length - 1;
    redraw();

    // Focus and select all text in omnibox for new tab
    omni.focus();
    omni.select();
});

api.onTabClosed(({ closedTabIndex, newActiveTabIndex }) => {
    tabs.splice(closedTabIndex, 1);
    activeTabIdx = newActiveTabIndex;
    redraw();
});

api.onTabSwitched(({ newActiveTabIndex }) => {
    activeTabIdx = newActiveTabIndex;
    redraw();
});

/* start with one tab button */
// Initial tab is created by main process, so no need to draw it here.
