/**
 * aether-ticker.js — live news + market feed
 *
 * NEWS: /research-feed.json — our own pipeline (HackerNews, arXiv, Reddit,
 *       DARPA, gov, X, web agent). Auto-updated by the repo's daily workflow.
 *       No third-party API. No key. No rate limit.
 *
 * MARKETS: Finnhub free public /quote endpoint (no key for basic ETF quotes).
 *          Falls back to static snapshot if unreachable.
 *
 * Refreshes every 5 minutes (feed is daily so no point hammering it).
 */

(function () {
  'use strict';

  const FEED_URL    = '/research-feed.json';
  const REFRESH_MS  = 5 * 60 * 1000; // 5 min — feed is daily, no need to spam

  const FINNHUB_SYMBOLS = [
    { sym: 'SPY',  label: 'S&P' },
    { sym: 'QQQ',  label: 'QQQ' },
    { sym: 'NVDA', label: 'NVDA' },
    { sym: 'MSFT', label: 'MSFT' },
  ];

  // Source badge colors
  const SOURCE_COLORS = {
    HackerNews: '#ff6600',
    arXiv:      '#b31b1b',
    Reddit:     '#ff4500',
    DARPA:      '#0033a0',
    default:    '#8fffd3',
  };

  // ── Market quotes (Finnhub free — no key for basic public quotes) ──────────
  async function fetchQuote(sym) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${sym}&token=`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) return null;
      const d = await r.json();
      if (typeof d.c !== 'number' || d.c === 0) return null;
      return { sym, price: d.c, pct: d.dp ?? 0 };
    } catch { return null; }
  }

  async function updateMarkets() {
    const inner = document.getElementById('ticker-markets-inner');
    if (!inner) return;

    const results = await Promise.all(FINNHUB_SYMBOLS.map(s => fetchQuote(s.sym)));
    const hits = results.filter(Boolean);

    if (hits.length === 0) {
      // Static fallback — show something rather than nothing
      inner.innerHTML = '<span class="ticker-quote"><span class="q-sym">SPY</span><span class="q-price">···</span></span>';
      return;
    }

    inner.innerHTML = '';
    hits.forEach(({ sym, price, pct }) => {
      const dir = pct > 0.001 ? 'up' : pct < -0.001 ? 'down' : 'flat';
      const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '–';
      const span = document.createElement('span');
      span.className = 'ticker-quote';
      span.innerHTML =
        `<span class="q-sym">${sym}</span>` +
        `<span class="q-price">$${price.toFixed(2)}</span>` +
        `<span class="q-chg ${dir}">${arrow}${Math.abs(pct).toFixed(2)}%</span>`;
      inner.appendChild(span);
    });
  }

  // ── Research feed (our own pipeline) ─────────────────────────────────────
  let _feedItems = [];
  let _feedTs    = 0;

  async function fetchFeed() {
    try {
      const r = await fetch(`${FEED_URL}?_=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const d = await r.json();
      const items = (d.items || []).slice(0, 20);
      if (items.length > 0) {
        _feedItems = items;
        _feedTs    = Date.now();
      }
    } catch { /* keep existing */ }
  }

  function renderFeed() {
    const track = document.getElementById('ticker-news-track');
    if (!track || _feedItems.length === 0) return;

    const sep = '<span class="ticker-sep">✦</span>';
    const html = _feedItems.map(item => {
      const color = SOURCE_COLORS[item.source] || SOURCE_COLORS.default;
      const badge = `<span style="color:${color};font-weight:800;font-size:10px;margin-right:5px;">[${escHTML(item.source || 'FEED')}]</span>`;
      return `${badge}<a href="${escAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escHTML(item.title)}</a>`;
    }).join(sep);

    track.innerHTML = html + sep;

    // Reset and rescale animation
    track.style.animation = 'none';
    void track.offsetWidth;
    const chars = track.textContent.length;
    const duration = Math.max(40, Math.round(chars * 0.13));
    track.style.animation = `ticker-scroll ${duration}s linear infinite`;
  }

  function escHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(s) {
    const u = String(s || '').trim();
    return /^https?:\/\//i.test(u) ? u.replace(/"/g, '%22') : '#';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    if (!document.getElementById('aether-ticker-css')) {
      const link = document.createElement('link');
      link.id   = 'aether-ticker-css';
      link.rel  = 'stylesheet';
      link.href = '/static/ticker.css';
      document.head.appendChild(link);
    }

    // Load feed and markets in parallel, render as they arrive
    await Promise.all([
      fetchFeed().then(renderFeed),
      updateMarkets(),
    ]);
  }

  // ── Refresh loop ──────────────────────────────────────────────────────────
  function startRefreshLoop() {
    setInterval(async () => {
      await fetchFeed();
      renderFeed();
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
