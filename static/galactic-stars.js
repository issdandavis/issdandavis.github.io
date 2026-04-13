/*
 * Galactic speckle starfield — the kind you'd see on an Asteroids cabinet.
 *
 * Static dots on a black canvas, fixed behind all content. No twinkle,
 * no parallax, no motion. Just speckle-paint stars like the old arcade.
 *
 *   <script src="/static/galactic-stars.js" defer></script>
 *
 * Options via window.GALACTIC_STARS (set before loading this script):
 *   density:     stars per 1000 px² (default 0.6)
 *   colors:      array of allowed star colors (default white, faint purple, faint green)
 *   max_radius:  largest star radius in px (default 1.8)
 *   nebula:      draw a soft nebula gradient behind the stars (default true)
 *   seed:        integer seed for deterministic layout (default random per session)
 */

(function () {
  if (typeof document === "undefined") return;
  if (document.getElementById("galactic-stars-canvas")) return; // already mounted

  var opts = Object.assign(
    {
      density: 0.6,
      colors: [
        "rgba(255,255,255,1)",
        "rgba(255,255,255,0.85)",
        "rgba(255,255,255,0.6)",
        "rgba(196,156,255,0.8)",
        "rgba(196,156,255,0.5)",
        "rgba(122,255,77,0.5)",
        "rgba(255,75,107,0.4)",
      ],
      max_radius: 1.8,
      nebula: true,
      seed: null,
    },
    window.GALACTIC_STARS || {}
  );

  // Tiny seedable PRNG so refresh can either be stable or random
  var seed = opts.seed != null ? (opts.seed >>> 0) : (Math.random() * 2 ** 32) >>> 0;
  function rand() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  var canvas = document.createElement("canvas");
  canvas.id = "galactic-stars-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = [
    "position:fixed",
    "inset:0",
    "width:100vw",
    "height:100vh",
    "z-index:-2",
    "pointer-events:none",
    "background:#000",
  ].join(";");
  (document.body || document.documentElement).appendChild(canvas);

  var ctx = canvas.getContext("2d");
  var stars = [];

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    regenerate(w, h);
    draw(w, h);
  }

  function regenerate(w, h) {
    var count = Math.max(60, Math.floor((w * h) / 1000 * opts.density));
    // Cap so we don't destroy perf on giant displays
    if (count > 900) count = 900;
    stars = [];
    for (var i = 0; i < count; i++) {
      stars.push({
        x: rand() * w,
        y: rand() * h,
        r: rand() * opts.max_radius + 0.3,
        c: opts.colors[Math.floor(rand() * opts.colors.length)],
        // Rare 5% get a faint glow ring for variety
        glow: rand() < 0.05,
      });
    }
  }

  function drawNebula(w, h) {
    // Soft deep-purple and faint neon-green nebula hints
    var grad1 = ctx.createRadialGradient(w * 0.18, h * 0.12, 0, w * 0.18, h * 0.12, Math.max(w, h) * 0.55);
    grad1.addColorStop(0, "rgba(139, 92, 246, 0.18)");
    grad1.addColorStop(0.35, "rgba(139, 92, 246, 0.05)");
    grad1.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad1;
    ctx.fillRect(0, 0, w, h);

    var grad2 = ctx.createRadialGradient(w * 0.82, h * 0.88, 0, w * 0.82, h * 0.88, Math.max(w, h) * 0.6);
    grad2.addColorStop(0, "rgba(255, 7, 58, 0.10)");
    grad2.addColorStop(0.4, "rgba(255, 7, 58, 0.03)");
    grad2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, w, h);

    var grad3 = ctx.createRadialGradient(w * 0.55, h * 0.45, 0, w * 0.55, h * 0.45, Math.max(w, h) * 0.75);
    grad3.addColorStop(0, "rgba(57, 255, 20, 0.06)");
    grad3.addColorStop(0.4, "rgba(57, 255, 20, 0.02)");
    grad3.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad3;
    ctx.fillRect(0, 0, w, h);
  }

  function draw(w, h) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    if (opts.nebula) drawNebula(w, h);

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      if (s.glow) {
        var grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        grad.addColorStop(0, s.c);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = s.c;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Debounced resize so typing in a textarea doesn't churn this
  var resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 180);
  }

  resize();
  window.addEventListener("resize", onResize);

  // Public handle for debug / theme dev
  window.galacticStars = {
    redraw: resize,
    opts: opts,
    canvas: canvas,
    star_count: function () { return stars.length; },
  };
})();
