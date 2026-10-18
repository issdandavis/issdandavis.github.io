/* Auto-delivery helper.
 * Maps every Stripe payment link on the site to its thank-you (download) page.
 * - Remembers the product a visitor clicked "Buy" on, so /thank-you.html can show
 *   the right download even if Stripe returns the buyer without ?product=.
 * - Adds an "Instant download after checkout" note under each buy button with the
 *   exact page to bookmark.
 */
(function () {
  var MAP = {
    'cNibJ25Ca2TJ9gQ3a6dby06': 'ai-governance-toolkit',
    '6oUeVe5Ca2TJdx6262dby08': 'hydra-agent-templates',
    '8x228sc0y3XNeBafWSdby05': 'n8n-workflow-pack',
    '5kQ5kE5Ca65V78I5iedby07': 'content-spin-engine',
    '28E8wQ5Cacuj64EaCydby0g': 'training-vault',
    'dRm9AU8Om3XN3Ww6midby0h': 'benchmark-kit',
    '14AbJ20hQ79ZboYfWSdby0n': 'process-pack'
  };
  // Products with no downloadable file in this repo yet: delivered by email on request.
  var EMAILED = { 'training-vault': 1, 'benchmark-kit': 1, 'process-pack': 1 };
  var STORE = 'aethermoore_last_purchase';

  function keyFor(href) {
    if (!href || href.indexOf('buy.stripe.com/') === -1) return null;
    var id = href.split('buy.stripe.com/')[1].split(/[?#]/)[0];
    return MAP[id] || null;
  }

  // Remember the product on click (works for links added later, e.g. by Polly).
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href*="buy.stripe.com/"]') : null;
    if (!a) return;
    var key = keyFor(a.getAttribute('href'));
    if (!key) return;
    try { localStorage.setItem(STORE, JSON.stringify({ key: key, t: Date.now() })); } catch (err) {}
  }, true);

  function annotate() {
    var links = document.querySelectorAll('a[href*="buy.stripe.com/"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest('nav, footer, .footer, .nav-links') || a.dataset.adNoted) continue;
      var key = keyFor(a.getAttribute('href'));
      if (!key) continue;
      a.dataset.adNoted = '1';
      var url = '/thank-you.html?product=' + key;
      var note = document.createElement('p');
      note.className = 'auto-delivery-note';
      note.style.cssText = 'margin:8px 0 0;font-size:12px;line-height:1.5;opacity:.85;width:100%;flex-basis:100%;';
      note.innerHTML = (EMAILED[key]
        ? '&#9889; After checkout, open your delivery page: '
        : '&#9889; Instant download after checkout. Your download page: ') +
        '<a href="' + url + '" style="color:inherit;text-decoration:underline">aethermoore.com' + url + '</a> &mdash; bookmark it.';
      var parent = a.parentElement;
      var anchorPoint = a;
      if (parent && parent.children.length > 1) {
        var cs = getComputedStyle(parent);
        // Only step outside a horizontal, non-wrapping button row; otherwise stay inside the card.
        if (cs.display.indexOf('flex') !== -1 && cs.flexDirection.indexOf('row') === 0 && cs.flexWrap === 'nowrap') anchorPoint = parent;
      }
      if (anchorPoint.nextElementSibling && anchorPoint.nextElementSibling.classList.contains('auto-delivery-note')) continue;
      anchorPoint.insertAdjacentElement('afterend', note);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', annotate);
  else annotate();
})();
