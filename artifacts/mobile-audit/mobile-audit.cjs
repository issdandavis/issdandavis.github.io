const path = require('path');
const fs = require('fs');
const candidates = [
  path.join('C:\\\\Users\\\\issda\\\\AetherDesk\\\\node_modules\\\\playwright'),
  path.join(__dirname, 'node_modules', 'playwright'),
  'playwright',
];
let playwright;
for (const c of candidates) {
  try { playwright = require(c); console.log('using', c); break; } catch (e) {}
}
if (!playwright) throw new Error('playwright not found');
const { chromium, devices } = playwright;

const outDir = process.argv[2] || __dirname;
const pages = [
  { id: 'home', url: 'https://aethermoore.com/' },
  { id: 'shop', url: 'https://aethermoore.com/shop.html' },
  { id: 'about', url: 'https://aethermoore.com/about.html' },
  { id: 'math-ledger', url: 'https://aethermoore.com/math-ledger.html' },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const iphone = devices['iPhone 13'];
  const context = await browser.newContext({ ...iphone });
  const page = await context.newPage();
  const report = { viewport: iphone.viewport, device: 'iPhone 13', pages: [] };

  for (const p of pages) {
    const entry = { id: p.id, url: p.url, ok: false, status: null, title: null, errors: [] };
    const cons = [];
    page.on('pageerror', (e) => cons.push('pageerror: ' + e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') cons.push('console: ' + msg.text()); });

    try {
      const resp = await page.goto(p.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(1500);
      entry.status = resp ? resp.status() : null;
      entry.title = await page.title();
      entry.ok = entry.status >= 200 && entry.status < 400;
      entry.overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          overflowX: doc.scrollWidth > doc.clientWidth + 2,
        };
      });
      entry.ctaTexts = await page.evaluate(() => {
        const pick = (sel) => Array.from(document.querySelectorAll(sel)).map(a => (a.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
        return {
          nav: pick('nav a, .nav a, .topbar a, .screen-nav a').slice(0, 20),
          buttons: pick('a.btn, button.btn, .hero-ctas a, .product-link, .btn-primary, .btn-gold').slice(0, 30),
        };
      });
      entry.smallTaps = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('a, button'));
        const small = [];
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.top < 2000 && (r.height < 36 || r.width < 36)) {
            small.push({ text: (el.textContent || '').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
        return small.slice(0, 20);
      });
      entry.screenshot = path.join(outDir, p.id + '-mobile.png');
      entry.fold = path.join(outDir, p.id + '-fold.png');
      await page.screenshot({ path: entry.screenshot, fullPage: true });
      await page.screenshot({ path: entry.fold, fullPage: false });
      entry.errors = cons.slice(0, 20);
    } catch (e) {
      entry.errors.push(String(e && e.message ? e.message : e));
    }
    page.removeAllListeners('pageerror');
    page.removeAllListeners('console');
    report.pages.push(entry);
    console.log(JSON.stringify({ id: entry.id, status: entry.status, overflowX: entry.overflow && entry.overflow.overflowX, smallTaps: (entry.smallTaps||[]).length, errs: entry.errors.length }));
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'mobile-report.json'), JSON.stringify(report, null, 2));
  console.log('DONE');
})().catch((e) => { console.error(e); process.exit(1); });
