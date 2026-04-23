/* Cookie Consent Banner — GDPR-compliant, minimal, no external deps */
(function() {
  const KEY = 'scbe_cookie_consent';
  if (localStorage.getItem(KEY)) return;

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center;">
      <span style="font-size:13px;line-height:1.5;">
        We use cookies and local storage for site functionality (preferences, training data export, API key storage). 
        No third-party trackers. No ad pixels.
      </span>
      <button id="cookie-accept" style="padding:8px 18px;border-radius:8px;background:linear-gradient(135deg,rgba(143,255,211,0.2),rgba(109,216,255,0.15));color:#8fffd3;border:1px solid rgba(143,255,211,0.35);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Accept</button>
      <button id="cookie-decline" style="padding:8px 18px;border-radius:8px;background:transparent;color:#6a9488;border:1px solid rgba(139,255,223,0.15);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Essential Only</button>
    </div>
  `;
  banner.style.cssText = `
    position:fixed;bottom:0;left:0;right:0;z-index:10000;
    background:rgba(4,16,15,0.95);backdrop-filter:blur(16px);
    border-top:1px solid rgba(139,255,223,0.15);
    padding:16px 24px;color:#9bc5ba;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    animation:cookieSlideUp 0.4s ease-out;
  `;

  const style = document.createElement('style');
  style.textContent = '@keyframes cookieSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
  document.head.appendChild(style);
  document.body.appendChild(banner);

  banner.querySelector('#cookie-accept').addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ functional: true, analytics: false, timestamp: new Date().toISOString() }));
    banner.remove();
  });
  banner.querySelector('#cookie-decline').addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ functional: true, analytics: false, essential_only: true, timestamp: new Date().toISOString() }));
    banner.remove();
  });
})();
