/* SCBE Members Gate — Client-side access control for static site */

(function() {
  const MEMBERS_KEY = 'scbe_members_access';
  const MEMBERS_HASH = 'a5c3d6e9f1b2'; // Simple obfuscation, not crypto-secure

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return h.toString(16);
  }

  window.scbeMembers = {
    isAuthorized: function() {
      return localStorage.getItem(MEMBERS_KEY) === MEMBERS_HASH;
    },

    authorize: function(password) {
      const inputHash = hash(password.trim().toLowerCase());
      // Accept either the shared password or a simple derived check
      if (inputHash === '4a8f2e1b' || password.trim() === 'AETHER2026') {
        localStorage.setItem(MEMBERS_KEY, MEMBERS_HASH);
        return true;
      }
      return false;
    },

    logout: function() {
      localStorage.removeItem(MEMBERS_KEY);
    },

    guard: function() {
      if (!this.isAuthorized()) {
        document.body.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg,#070711);color:var(--text,#edf0ff);font-family:sans-serif;text-align:center;padding:24px;">
            <div style="max-width:400px;">
              <div class="eyebrow" style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:var(--accent,#8590ff);font-weight:700;margin-bottom:10px;">Members Only</div>
              <h1 style="font-size:28px;margin-bottom:12px;">This area is gated.</h1>
              <p style="color:var(--muted,#afb5da);margin-bottom:24px;">Join the SCBE insider list to access exclusive research notes, early datasets, and member-only tools.</p>
              <a href="/members/" class="btn btn-primary" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(135deg,#8590ff,#7b8cff);color:#fff;text-decoration:none;font-weight:600;">Get Access</a>
            </div>
          </div>
        `;
        return false;
      }
      return true;
    }
  };
})();
