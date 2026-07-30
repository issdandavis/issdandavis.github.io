const path = require('path');
const fs = require('fs');
const playwright = require('C:\\\\Users\\\\issda\\\\AetherDesk\\\\node_modules\\\\playwright');
const { chromium, devices } = playwright;
const outDir = process.argv[2];
(async () => {
  const browser = await chromium.launch({ headless: true });
  const iphone = devices['iPhone 13'];
  const context = await browser.newContext({ ...iphone });
  // pre-accept cookies so fold shows CTAs
  await context.addInitScript(() => {
    localStorage.setItem('scbe_cookie_consent', JSON.stringify({ functional: true, essential_only: true }));
  });
  const page = await context.newPage();
  const pages = [
    { id: 'home', url: 'https://aethermoore.com/?v=mobile2' },
    { id: 'shop', url: 'https://aethermoore.com/shop.html?v=mobile2' },
    { id: 'math-ledger', url: 'https://aethermoore.com/math-ledger.html?v=mobile2' },
  ];
  for (const p of pages) {
    await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const info = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.hero-ctas a, a.btn-gold, a.btn-primary')).map(a => ({
        text: (a.textContent||'').trim().replace(/\s+/g,' '),
        top: Math.round(a.getBoundingClientRect().top),
        visible: a.getBoundingClientRect().top > 0 && a.getBoundingClientRect().top < window.innerHeight - 20,
      }));
      return {
        tickerDisplay: getComputedStyle(document.getElementById('aether-ticker-bar')||document.body).display,
        tickerExists: !!document.getElementById('aether-ticker-bar'),
        cookie: !!document.getElementById('cookie-banner'),
        vh: window.innerHeight,
        ctas: btns.slice(0, 8),
      };
    });
    console.log(p.id, JSON.stringify(info, null, 0));
    await page.screenshot({ path: path.join(outDir, p.id + '-fold-v2.png'), fullPage: false });
  }
  await browser.close();
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
