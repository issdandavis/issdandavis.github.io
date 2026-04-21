/* SCBE Members Gate — PIN + custom password system */

(function() {
  const STORAGE_KEY = 'scbe_member_auth';
  const PIN_MARKER = '7392841'; // 7-digit PIN sent in welcome email. Change anytime.

  function loadAuth() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveAuth(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(16);
  }

  window.scbeMembers = {
    // Check if user has a stored custom password
    hasCustomPassword: function(email) {
      const auth = loadAuth();
      return !!(auth[email] && auth[email].password);
    },

    // Validate 7-digit PIN (the marker from welcome email)
    validatePin: function(pin) {
      return pin.trim() === PIN_MARKER;
    },

    // Set custom password after PIN validation
    setPassword: function(email, password) {
      if (!email || !password || password.length < 7) {
        return { ok: false, error: 'Password must be at least 7 characters.' };
      }
      const auth = loadAuth();
      auth[email.trim().toLowerCase()] = {
        password: password,
        hash: hash(password),
        created: new Date().toISOString()
      };
      saveAuth(auth);
      return { ok: true };
    },

    // Login with custom password
    login: function(email, password) {
      const auth = loadAuth();
      const record = auth[email.trim().toLowerCase()];
      if (!record) {
        return { ok: false, error: 'Email not found. Enter your PIN first.' };
      }
      if (hash(password) !== record.hash) {
        return { ok: false, error: 'Incorrect password.' };
      }
      // Store session
      sessionStorage.setItem('scbe_member_session', email.trim().toLowerCase());
      return { ok: true };
    },

    // Check if currently logged in
    isAuthorized: function() {
      return !!sessionStorage.getItem('scbe_member_session');
    },

    // Logout
    logout: function() {
      sessionStorage.removeItem('scbe_member_session');
    },

    // Guard members-only pages
    guard: function() {
      if (!this.isAuthorized()) {
        document.body.innerHTML = `
          <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg,#070711);color:var(--text,#edf0ff);font-family:sans-serif;text-align:center;padding:24px;">
            <div style="max-width:400px;">
              <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:var(--accent,#8590ff);font-weight:700;margin-bottom:10px;">Members Only</div>
              <h1 style="font-size:28px;margin-bottom:12px;">This area is gated.</h1>
              <p style="color:var(--muted,#afb5da);margin-bottom:24px;">Enter your PIN from the welcome email to access exclusive research and datasets.</p>
              <a href="/members/" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(135deg,#8590ff,#7b8cff);color:#fff;text-decoration:none;font-weight:600;">Get Access</a>
            </div>
          </div>
        `;
        return false;
      }
      return true;
    }
  };
})();
