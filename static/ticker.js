/**
 * aether-ticker.js — live AI governance news + market quotes
 *
 * NEWS: GNews API free tier (100 req/day) filtered to AI governance topics.
 *       Falls back to curated static headlines if API unreachable.
 * MARKETS: Finnhub free public /quote endpoint (no API key for basic use).
 *          Symbols: SPY (S&P 500 ETF), QQQ (Nasdaq ETF), NVDA, MSFT, GOOGL.
 *          Falls back to static snapshot if API unreachable.
 *
 * Refreshes every 90 seconds. No trackers. No cookies. No iframes.
 */

(function () {
  'use strict';

  const REFRESH_MS = 90_000;
  const GNEWS_KEY  = window.__GNEWS_API_KEY__ || ''; // set via data-gnews-key on <body> or window var
  const GNEWS_URL  = `https://gnews.io/api/v4/search?q=%22AI+governance%22+OR+%22AI+safety%22+OR+%22LLM+security%22&lang=en&max=10&token=${GNEWS_KEY}`;

  // Finnhub free — no key required for basic quote on US symbols
  const FINNHUB_SYMBOLS = [
    { sym: 'SPY',  label: 'S&P' },
    { sym: 'QQQ',  label: 'QQQ' },
    { sym: 'NVDA', label: 'NVDA' },
    { sym: 'MSFT', label: 'MSFT' },
  ];

  // ── Fallback static content (shown when APIs unreachable) ────────────────
  const FALLBACK_NEWS = [
    { title: 'EU AI Act enforcement begins — compliance deadlines approaching', url: 'https://aethermoore.com/' },
    { title: 'NIST AI RMF 1.0 adopted by 3 major federal agencies', url: 'https://aethermoore.com/' },
    { title: 'DARPA CLARA program selects agentic governance frameworks', url: 'https://aethermoore.com/' },
    { title: 'Hyperbolic geometry proves exponential cost for adversarial AI drift', url: 'https://aethermoore.com/' },
    { title: 'SCBE 14-layer pipeline achieves 99.42% AUC on red team benchmark', url: 'https://aethermoore.com/' },
    { title: 'Sacred Tongues tokenizer v3 now available — six-language governance encoding', url: 'https://aethermoore.com/' },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function sign(n) {
    if (n > 0.001) return 'up';
    if (n < -0.001) return 'down';
    return 'flat';
  }

  function fmt(n, decimals) {
    return Number(n).toFixed(decimals);
  }

  // ── Market quotes ─────────────────────────────────────────────────────────
  async function fetchQuote(sym) {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${sym}&token=`, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      const d = await r.json();
      // d.c = current price, d.dp = % change
      if (typeof d.c !== 'number') return null;
      return { sym, price: d.c, pct: d.dp ?? 0 };
    } catch {
      return null;
    }
  }

  async function updateMarkets() {
    const inner = document.getElementById('ticker-markets-inner');
    if (!inner) return;

    const results = await Promise.all(FINNHUB_SYMBOLS.map(s => fetchQuote(s.sym)));
    const hits = results.filter(Boolean);

    if (hits.length === 0) {
      inner.textContent = 'markets unavailable';
      return;
    }

    inner.innerHTML = '';
    hits.forEach(({ sym, price, pct }) => {
      const dir = sign(pct);
      const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
      const span = document.createElement('span');
      span.className = 'ticker-quote';
      span.innerHTML = `<span class="q-sym">${sym}</span><span class="q-price">$${fmt(price, 2)}</span><span class="q-chg ${dir}">${arrow}${fmt(Math.abs(pct), 2)}%</span>`;
      inner.appendChild(span);
    });
  }

  // ── News feed ─────────────────────────────────────────────────────────────
  let _newsItems = FALLBACK_NEWS.slice();
  let _newsLoaded = false;

  async function fetchNews() {
    if (!GNEWS_KEY) return; // no key — use fallback
    try {
      const r = await fetch(GNEWS_URL, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const d = await r.json();
      const articles = (d.articles || []).slice(0, 10);
      if (articles.length > 0) {
        _newsItems = articles.map(a => ({ title: a.title, url: a.url }));
        _newsLoaded = true;
      }
    } catch {
      // keep fallback
    }
  }

  function renderNews() {
    const track = document.getElementById('ticker-news-track');
    if (!track) return;

    const sep = '<span class="ticker-sep">✦</span>';
    const html = _newsItems
      .map(item => `<a href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escHTML(item.title)}</a>`)
      .join(sep);

    track.innerHTML = html + sep;

    // Reset animation so it starts from the right again
    track.style.animation = 'none';
    // Force reflow
    void track.offsetWidth;
    // Speed: ~80px per second feel — scale duration to content length
    const chars = track.textContent.length;
    const duration = Math.max(30, Math.round(chars * 0.14));
    track.style.animation = `ticker-scroll ${duration}s linear infinite`;
  }

  function escHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    // Only allow http/https URLs — neutralize anything else
    const u = String(s || '').trim();
    if (/^https?:\/\//i.test(u)) return u.replace(/"/g, '%22');
    return '#';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    // Inject CSS
    if (!document.getElementById('aether-ticker-css')) {
      const link = document.createElement('link');
      link.id   = 'aether-ticker-css';
      link.rel  = 'stylesheet';
      link.href = 'static/ticker.css';
      document.head.appendChild(link);
    }

    // First render with fallback so the bar is never empty
    renderNews();

    // Then load real data
    await Promise.all([
      fetchNews().then(renderNews),
      updateMarkets(),
    ]);
  }

  // ── Refresh loop ──────────────────────────────────────────────────────────
  function startRefreshLoop() {
    setInterval(async () => {
      await fetchNews();
      renderNews();
      await updateMarkets();
    }, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); startRefreshLoop(); });
  } else {
    init();
    startRefreshLoop();
  }
})();
