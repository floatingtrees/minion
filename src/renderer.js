const api = window.browserAPI;
const tabs = [];                        // store {id, title} for each tab
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
}

async function closeTab(idx) {
    if (tabs.length === 1) return;
    api.closeTab(idx);
    tabs.splice(idx, 1);

    if (idx < activeTabIdx) {
        activeTabIdx--;
    } else if (activeTabIdx >= tabs.length) {
        activeTabIdx = tabs.length - 1;
    }

    api.activateTab(activeTabIdx);
    redraw();
}

/* ───────── events ───────── */
bar.addEventListener('click', e => {
    const tabButton = e.target.closest('.tab');
    if (!tabButton) return; // Click was not on a tab or its children

    const i = +tabButton.dataset.i;
    const id = +tabButton.dataset.id;

    if (e.target.classList.contains('close-x')) {
        api.closeTab(id);
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
    if (e.key === 'Enter') api.navigate(e.target.value);
});

document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        api.newTab();
        tabs.push('New Tab');
        activeTabIdx = tabs.length - 1;
        redraw();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault();
        closeTab(activeTabIdx);
    }

    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const idx = e.key === '9' ? tabs.length - 1 : +e.key - 1;
        if (idx < tabs.length) {
            activeTabIdx = idx;
            api.activateTab(idx);
            redraw();
        }
    }

    // Add CMD+arrow navigation
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        api.goBack();
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        api.goForward();
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

api.onTabCreated((tabData) => {
    tabs.push({ id: tabData.id, title: 'New Tab' });
    activeTabIdx = tabs.length - 1;
    redraw();
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
