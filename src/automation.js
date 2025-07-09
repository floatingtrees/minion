const { chromium } = require('playwright-core');

(async () => {
    // 1️⃣ Attach to Electron’s internal DevTools endpoint
    const debuggerURL = `http://localhost:${process.debugPort}/json`; // Electron exposes one
    const browser = await chromium.connectOverCDP(debuggerURL);        // :contentReference[oaicite:4]{index=4}
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = await ctx.newPage();

    /* -------- background job -------- */
    await page.goto('https://example.com/login');
    await page.screenshot({ path: 'first.png', fullPage: true });      // :contentReference[oaicite:5]{index=5}
    await page.mouse.move(450, 300);                                   // :contentReference[oaicite:6]{index=6}
    await page.mouse.click(450, 300);
})();
