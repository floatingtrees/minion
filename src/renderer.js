const api = window.browserAPI;
const tabs = [];                        // store title for each tab
const bar = document.getElementById('tabbar');
const omni = document.getElementById('omnibox');
const newTabBtn = document.getElementById('new-tab-button');

function redraw() {
    bar.innerHTML = tabs.map((t, i) =>
        `<button class="tab" data-i="${i}">${t || 'New Tab'} ✕</button>`).join('');
}

/* ───────── events ───────── */
bar.addEventListener('click', e => {
    const idx = +e.target.dataset.i;
    if (e.altKey) { api.closeTab(idx); tabs.splice(idx, 1); }
    else { api.activateTab(idx); }
    redraw();
});

newTabBtn.addEventListener('click', () => {
    api.newTab(); tabs.push('New Tab'); redraw();
});

omni.addEventListener('keydown', e => {
    if (e.key === 'Enter') api.navigate(e.target.value);
});

document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        api.newTab(); tabs.push('New Tab'); redraw();
    }

    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        const idx = e.key === '9' ? tabs.length - 1 : +e.key - 1;
        api.activateTab(idx);
        redraw();
    }
});

/* ───────── update titles from main (optional) ───────── */
api.onTitle((idx, title) => { tabs[idx] = title; redraw(); });

/* start with one tab button */
tabs.push('New Tab'); redraw();
