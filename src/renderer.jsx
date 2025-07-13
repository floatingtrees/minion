// src/renderer.jsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Tabs } from '@sinm/react-chrome-tabs';
import '@sinm/react-chrome-tabs/css/chrome-tabs.css';

function App() {
    const [tabs, setTabs] = useState([]);
    const add = async (url = 'about:blank') => {
        const tab = await window.api.newTab(url);
        setTabs(t => t.map(x => ({ ...x, active: false })).concat({ ...tab, active: true }));
    };

    return (
        <>
            <div style={{ height: 56, display: 'flex', alignItems: 'center' }}>
                <Tabs tabs={tabs}
                    onTabActive={id => { window.api.activate(id); setTabs(t => t.map(x => ({ ...x, active: x.id === id }))); }}
                    onTabClose={id => { window.api.close(id); setTabs(t => t.filter(x => x.id !== id)); }} />
                <input style={{ flex: 1, marginLeft: 8 }}
                    placeholder="Search Google or type a URL"
                    onKeyDown={e => { if (e.key === 'Enter') { window.api.navigate(e.target.value); } }} />
                <button onClick={() => add('about:blank')}>＋</button>
            </div>
        </>
    );
}
createRoot(document.getElementById('app')).render(<App />);
