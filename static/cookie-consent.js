/* Cookie Consent Banner — GDPR-compliant, minimal, no external deps */
(function() {
  const KEY = 'scbe_cookie_consent';
  if (localStorage.getItem(KEY)) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.innerHTML = `
    <div class="cookie-inner">
      <span class="cookie-text">
        Cookies/local storage for site features only. No ad trackers.
      </span>
      <div class="cookie-actions">
        <button type="button" id="cookie-accept" class="cookie-btn cookie-accept">Accept</button>
        <button type="button" id="cookie-decline" class="cookie-btn cookie-decline">Essential</button>
      </div>
    </div>
  `;
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:10000;
    background:rgba(4,16,15,0.96);backdrop-filter:blur(16px);
    border-top:1px solid rgba(139,255,223,0.15);
    padding:10px 14px;color:#9bc5ba;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    animation:cookieSlideUp 0.35s ease-out;
  `;

  const style = document.createElement('style');
  style.textContent = [
    '@keyframes cookieSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '.cookie-inner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between;max-width:1100px;margin:0 auto}',
    '.cookie-text{font-size:12px;line-height:1.4;flex:1;min-width:160px}',
    '.cookie-actions{display:flex;gap:8px;flex-shrink:0}',
    '.cookie-btn{padding:10px 14px;min-height:44px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}',
    '.cookie-accept{background:linear-gradient(135deg,rgba(143,255,211,0.2),rgba(109,216,255,0.15));color:#8fffd3;border:1px solid rgba(143,255,211,0.35)}',
    '.cookie-decline{background:transparent;color:#6a9488;border:1px solid rgba(139,255,223,0.15)}',
    '@media (max-width:480px){.cookie-inner{flex-direction:column;align-items:stretch}.cookie-actions{width:100%}.cookie-btn{flex:1}}',
  ].join('');
  document.head.appendChild(style);
  document.body.appendChild(banner);

  const accept = banner.querySelector('#cookie-accept');
  const decline = banner.querySelector('#cookie-decline');
  if (accept) accept.addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ functional: true, analytics: false, timestamp: new Date().toISOString() }));
    banner.remove();
  });
  if (decline) decline.addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ functional: true, analytics: false, essential_only: true, timestamp: new Date().toISOString() }));
    banner.remove();
  });
})();
