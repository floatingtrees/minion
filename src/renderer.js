const api = window.browserAPI;
const tabs = [];                        // store {id, title, url} for each tab
let activeTabIdx = 0;                   // track the currently active tab
const bar = document.getElementById('tabbar');
const tabCoordIndicator = document.createElement('span');
tabCoordIndicator.id = 'tab-coord-indicator';
tabCoordIndicator.textContent = 'Mouse: --';
tabCoordIndicator.style.cssText = 'margin-left:auto;padding:4px 8px;font-size:12px;color:#444;white-space:nowrap;';
const omni = document.getElementById('omnibox');
const newTabBtn = document.getElementById('new-tab-button');
const backBtn = document.getElementById('back-button');
const forwardBtn = document.getElementById('forward-button');
const screenshotBtn = document.getElementById('screenshot-button');
const sidebarBtn = document.getElementById('sidebar-button');
const sidebar = document.getElementById('sidebar');
const sidebarContent = document.getElementById('sidebar-content');
const searchInput = document.getElementById('search-input');
let sidebarVisible = false;

const SERVER_VIEW_WIDTH = 1280;
const SERVER_VIEW_HEIGHT = 800;

async function mapServerCoordsToWindow(serverX = 0, serverY = 0) {
    const view = await api.getViewSize();
    if (!view || !view.width || !view.height) {
        window.browserAPI.log("No view size found, using server coords", serverX, serverY);
        return {
            x: Math.round(serverX),
            y: Math.round(serverY)
        };
    }

    const clampedX = Math.min(Math.max(serverX, 0), SERVER_VIEW_WIDTH);
    const clampedY = Math.min(Math.max(serverY, 0), SERVER_VIEW_HEIGHT);

    const relativeX = Math.round((clampedX / SERVER_VIEW_WIDTH) * (view.width - 1));
    const relativeY = Math.round((clampedY / SERVER_VIEW_HEIGHT) * (view.height - 1));

    const windowX = view.x + relativeX;
    const windowY = view.y + relativeY;
    //window.browserAPI.log(`${view.width}, ${view.height}, ${view.x}, ${view.y}`);
    return {
        x: windowX,
        y: windowY
    };
}

async function INVERSEmapServerCoordsToWindow(browserX = 0, browserY = 0) {
    const view = await api.getViewSize();
    if (!view || !view.width || !view.height) {
        return {
            x: Math.round(browserX),
            y: Math.round(browserY)
        };
    }

    const relativeX = browserX - view.x;
    const relativeY = browserY;

    const serverX = Math.round((relativeX / (view.width - 1)) * SERVER_VIEW_WIDTH);
    const serverY = Math.round((relativeY / (view.height - 1)) * SERVER_VIEW_HEIGHT);

    //window.browserAPI.log(`INVERSE ${view.width}, ${view.height}, ${view.x}, ${view.y}`);
    return {
        x: serverX,
        y: serverY
    };
}

function redraw() {
    // Create tabs HTML with fixed width to prevent overflow
    const tabsHTML = tabs.map((t, i) => {
        const title = t.title || 'New Tab';
        // Truncate title if too long, but always keep the X visible
        const displayTitle = title.length > 15 ? title.substring(0, 12) + '...' : title;
        return `<button class="tab ${i === activeTabIdx ? 'active' : ''}" data-i="${i}" data-id="${t.id}" style="min-width: 80px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayTitle} <span class="close-x">✕</span></button>`;
    }).join('');

    // Preserve the new tab button by temporarily removing it, updating innerHTML, then re-adding it
    bar.innerHTML = tabsHTML;
    if (newTabBtn) bar.appendChild(newTabBtn);
    bar.appendChild(tabCoordIndicator);

    // Update omnibox to show current tab's URL
    updateOmnibox();
}

function updateOmnibox() {
    if (tabs[activeTabIdx]) {
        omni.value = tabs[activeTabIdx].url || '';
        // Keep text selected when switching tabs
        // Use setTimeout to ensure selection happens after any click events
        setTimeout(() => {
            omni.select();
        }, 0);
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
        const view = await api.getViewSize();
        const cursor = await api.getGlobalCursorPosition();

        const frameMsg = `View frame: ${view.width} × ${view.height} at (${view.x}, ${view.y})`;
        const cursorMsg = `Cursor position: (${cursor.x}, ${cursor.y})`;

        console.log(frameMsg);
        console.log(cursorMsg);
        window.browserAPI.log(frameMsg);
        window.browserAPI.log(cursorMsg);
    } catch (error) {
        console.error('Error fetching frame size or cursor position:', error);
        window.browserAPI.log(`Error: ${error.message || error}`);
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
    } else if (e.key === 'Escape') {
        omni.blur();  // Remove focus on escape
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
    // Use setTimeout to ensure selection happens after any blur events
    // Increased delay to handle BrowserView focus transitions
    setTimeout(() => {
        if (document.activeElement === omni) {
            omni.select();
        }
    }, 50);
});

// Clear selection when omnibox loses focus
omni.addEventListener('blur', () => {
    // Add longer delay to handle BrowserView focus transitions
    setTimeout(() => {
        // Only clear selection if omnibox is not focused
        if (document.activeElement !== omni) {
            // Clear any text selection
            if (window.getSelection) {
                window.getSelection().removeAllRanges();
            }
            // Also clear the input selection
            omni.selectionStart = omni.selectionEnd = omni.value.length;
        }
    }, 100);
});

// Handle clicks on the chrome area to properly manage focus
document.getElementById('chrome').addEventListener('click', (e) => {
    // If clicking on the omnibox, ensure text gets selected
    if (e.target.id === 'omnibox') {
        setTimeout(() => {
            if (document.activeElement === omni) {
                omni.select();
            }
        }, 0);
    }
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

// Sidebar content management functions
function setSidebarContent(text) {
    sidebarContent.textContent = text;
    // Auto-scroll to bottom when new content is added
    sidebarContent.scrollTop = sidebarContent.scrollHeight;
}

function appendSidebarContent(text) {
    sidebarContent.textContent += text;
    // Auto-scroll to bottom when new content is added
    sidebarContent.scrollTop = sidebarContent.scrollHeight;
}

function clearSidebarContent() {
    sidebarContent.textContent = '';
}

async function processAction(actionInfo) {
    const { action } = actionInfo;

    if (action === "screenshot") {
        // Get base64 data directly from the preload bridge (captures entire window)
        const base64Data = await api.takeScreenshot();
        window.browserAPI.log("Screenshot captured (entire window)");
        // Return *only* the image block (the outer tool_result
        // wrapper is built later in pingServer)
        return {
            type: "image",
            source: {
                type: "base64",
                media_type: "image/jpeg",
                data: base64Data                                // direct base64 data
            }
        };
    }

    else if (action === "left_click") {
        const serverCoord = actionInfo.coordinate ?? { x: 0, y: 0 };
        const { x, y } = await mapServerCoordsToWindow(serverCoord.x, serverCoord.y);
        window.browserAPI.log("CLICKED", x, y);
        return await api.leftClick(x, y);                   // whatever your bridge returns
    }
    else if (action === "type") {
        const text = actionInfo.text ?? "";
        return await api.type(text);
    }
    else if (action === "mouse_move") {
        const serverCoord = actionInfo.coordinate ?? { x: 0, y: 0 };
        const { x, y } = await mapServerCoordsToWindow(serverCoord.x, serverCoord.y);
        return await api.mouseMove(x, y);
    }

    window.browserAPI.log("Unknown action:", action);
    return null;
}


async function pingServer(token) {
    try {
        const res = await fetch("http://localhost:8080/task-ping", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token })
        });

        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const { response: actionList } = await res.json();
        if (!Array.isArray(actionList) || !actionList.length) return []; // nothing to do

        const results = [];
        for (const a of actionList) {
            const contentBlock = await processAction(a.action_info);
            if (!contentBlock) continue;                       // skip if null

            results.push({
                type: "tool_result",                             // literal must match backend
                tool_use_id: a.tool_use_id,
                content: [contentBlock]                          // MUST be an array
            });
        }
        return results;
    } catch (err) {
        window.browserAPI.log("Ping error:", err);
        appendSidebarContent(`Error: ${err.message}\n`);
        return [];
    }
}

async function returnTasks(token, results) {
    if (!results.length) return;                           // nothing to send

    try {
        const res = await fetch("http://localhost:8080/tool-results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, results })
        });

        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            appendSidebarContent(decoder.decode(value, { stream: true }));
        }
        appendSidebarContent("\n");
    } catch (err) {
        window.browserAPI.log("Return‑tasks error:", err);
    }
}


async function sendSearchQuery(query) {
    appendSidebarContent(`\n> ${query}\n`);

    try {
        const res = await fetch("http://localhost:8080/agent-execution", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query })
        });

        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const token = res.headers.get("X-Task-Id");          // save for follow‑ups

        // Stream assistant text
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            appendSidebarContent(decoder.decode(value, { stream: true }));
        }
        appendSidebarContent("\n");

        // Handle any tool_use requests that came back
        await runComputerUseLoop(token);
    } catch (err) {
        window.browserAPI.log("Search error:", err);
        appendSidebarContent(`Error: ${err.message}\n`);
    }
}
// Auto-resize textarea function
function autoResizeTextarea(textarea) {
    // Temporarily reset height to recalculate
    textarea.style.height = 'auto';

    // Calculate line height and maximum height (6 lines)
    const computedStyle = getComputedStyle(textarea);
    const lineHeight = parseFloat(computedStyle.lineHeight);
    const maxHeight = lineHeight * 6;

    // Get the actual content height needed
    const contentHeight = textarea.scrollHeight;
    const newHeight = Math.min(contentHeight, maxHeight);

    // Set the new height
    textarea.style.height = newHeight + 'px';

    // Handle overflow scrolling
    if (contentHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.overflowY = 'hidden';
    }
}

if (searchInput) {
    // Auto-resize on input and paste
    searchInput.addEventListener('input', () => {
        autoResizeTextarea(searchInput);
    });

    searchInput.addEventListener('paste', () => {
        // Use setTimeout to let paste complete before resizing
        setTimeout(() => {
            autoResizeTextarea(searchInput);
        }, 0);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent new line
            const query = searchInput.value.trim();
            if (query) {
                sendSearchQuery(query);
                searchInput.value = ''; // Clear the input after sending
                autoResizeTextarea(searchInput); // Reset height
            }
        }
        // Allow Shift+Enter for new lines
        // Allow standard copy/paste shortcuts (Cmd+C, Cmd+V, Cmd+A, etc.)
    });

    // Initial resize
    autoResizeTextarea(searchInput);
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
            omni.select();
        }
    }
});

// Global test function for leftClick (can be called from developer console)
window.testLeftClick = async function (x = 100, y = 100) {
    console.log(`Testing left click at coordinates (${x}, ${y})`);
    const result = await api.leftClick(x, y);
    console.log('Left click result:', result);
    return result;
};

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

api.onSidebarToggle((isVisible) => {
    sidebarVisible = isVisible;
    sidebar.classList.toggle('sidebar-hidden', !isVisible);
    sidebar.classList.toggle('sidebar-visible', isVisible);
});

// Expose sidebar functions globally for programmatic access
window.sidebar = {
    setContent: setSidebarContent,
    appendContent: appendSidebarContent,
    clearContent: clearSidebarContent
};

// Track mouse position globally (works over web content too)
async function updateTabMouseIndicator() {
    try {
        const [cursor, view] = await Promise.all([
            api.getGlobalCursorPosition(),
            api.getViewSize()
        ]);

        if (!cursor) {
            tabCoordIndicator.textContent = 'Mouse: --';
            return;
        }

        let label = `Mouse: (${Math.round(cursor.x)}, ${Math.round(cursor.y)})`;

        if (view && view.width && view.height) {
            const withinView = cursor.x >= view.x && cursor.x < view.x + view.width &&
                cursor.y >= view.y && cursor.y < view.y + view.height;

            if (withinView) {
                const relX = Math.round(cursor.x - view.x);
                const relY = Math.round(cursor.y - view.y);
                const { x, y } = await INVERSEmapServerCoordsToWindow(relX, relY)
                label = `Web: (${cursor.x}, ${cursor.y}, ${x}, ${y})`;
            } else {
                label = `UI: (${Math.round(cursor.x)}, ${Math.round(cursor.y)})`;
            }
        }

        tabCoordIndicator.textContent = label;
    } catch (error) {
        tabCoordIndicator.textContent = 'Mouse: --';
    }
}

setInterval(updateTabMouseIndicator, 100);
updateTabMouseIndicator();

window.getDisplayBounds = async function () {
    const view = await api.getViewSize();
    if (!view) return null;
    return {
        x: view.x,
        y: view.y,
        width: view.width,
        height: view.height
    };
};

/* start with one tab button */
// Initial tab is created by main process, so no need to draw it here.

async function runComputerUseLoop(token) {
    const MAX_ITERATIONS = 12;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const actions = await pingServer(token);
        if (!actions.length) {
            window.browserAPI.log("computer-use: no actions, stopping");
            return;
        }

        await returnTasks(token, actions);
    }

    window.browserAPI.log("computer-use: reached max iterations");
}
