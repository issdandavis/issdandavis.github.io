# Polly backend

FastAPI service that powers the Polly sidebar chat on aethermoore.com.
Provides catalog-grounded answers so the frontend can quote real prices
and real product URLs without hallucinating inventory.

## Run locally

```bash
cd scripts/polly-backend
pip install -r requirements.txt
python server.py
```

Visits `http://localhost:8001/health` to verify.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness + catalog summary |
| GET | `/v1/polly/catalog` | Full product catalog JSON |
| POST | `/v1/polly/search` | Keyword match across catalog |
| POST | `/v1/polly/quote` | Pricing lookup for a named item |
| GET | `/v1/polly/package/npm/{name}` | Live npm package metadata |
| GET | `/v1/polly/package/pypi/{name}` | Live PyPI package metadata |
| POST | `/v1/polly/respond` | Main chat entrypoint (grounded answer) |

## Wire it up to the site

The Polly sidebar already looks for `window.__POLLY_BACKEND_HTTP__`. Set it
on any page that should use the live backend:

```html
<script>
  window.__POLLY_BACKEND_HTTP__ = "https://polly.yourdomain.com";
</script>
<script src="/static/polly-sidebar.js"></script>
```

If the backend is unreachable, the sidebar falls back to its baked-in
catalog prompt and keeps working.

## Expose it publicly — ProtonVPN Business (recommended)

ProtonVPN Business hides your server's real IP behind a dedicated Proton IP
and routes inbound traffic to you via port forwarding.

### One-time setup

1. **In ProtonVPN app** (Windows):
   - Go to **Settings → Features** and enable **Port Forwarding**
   - Connect to a **P2P server** (double-arrow icon in the server list)
   - Hover over the **Port Forwarding shortcut** on the home screen — it shows your assigned port (e.g. `54321`)

2. **Copy and fill `.env`**:
   ```bash
   cp .env.example .env
   # Set POLLY_PORT to the ProtonVPN-assigned port
   # Set POLLY_EGG_KEY_SEED to a strong random value
   # Set POLLY_MODEL / OLLAMA_BASE_URL for your local Ollama
   ```

3. **DNS** — add an A record for `api.aethermoore.com` pointing to your
   Proton dedicated IP (find it in the ProtonVPN business portal).

4. **Start the server**:
   ```powershell
   # Windows (auto-detects Proton port, opens firewall rule)
   .\start.ps1
   ```
   ```bash
   # Linux / WSL
   chmod +x start.sh && ./start.sh
   ```

The startup scripts auto-detect the Proton-assigned port from the app's
state files and open the correct firewall rule automatically.

### Port changes on reconnect

The forwarded port changes when you disconnect and reconnect to ProtonVPN.
When that happens:
- Update `POLLY_PORT` in `.env` to the new port
- Restart the server: `.\start.ps1`
- The firewall script creates a new rule for the new port automatically

A Proton dedicated IP (static) prevents IP changes. The port still rotates
on reconnect — keep `.env` in sync.

### Frontend wiring

Set this on your site before the sidebar script loads:

```html
<script>
  window.__POLLY_BACKEND_HTTP__ = "https://api.aethermoore.com:54321";
</script>
```

Replace `54321` with your actual Proton-assigned port (or proxy it through
Nginx on port 443 to avoid non-standard port in URLs).

### Nginx reverse proxy (optional — clean URL)

If you run Nginx on the same machine while connected to ProtonVPN:

```nginx
server {
    listen 443 ssl;
    server_name api.aethermoore.com;

    location / {
        proxy_pass http://127.0.0.1:54321;  # your Proton port
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then frontend uses `https://api.aethermoore.com` with no port suffix.

## Expose it for free (alternative options)

1. **Cloudflare Tunnel** (stable URL, no Proton required):
   ```bash
   cloudflared tunnel --url http://localhost:8001
   ```
2. **ngrok** (requires signup):
   ```bash
   ngrok http 8001
   ```
3. **GitHub Actions** (ephemeral, 6-hour lifetime): see
   `.github/workflows/polly-backend.yml` in the site repo. Kicks off a
   job with `workflow_dispatch`, starts uvicorn inside the runner, and
   tunnels via cloudflared.

## Editing the catalog

Everything lives in `catalog.json`. The server caches it in memory on
startup, so after edits restart the process (or hit it with SIGHUP
if you wire that up).

Structure:

- `solutions[]` – vertical SaaS offerings (CX Guardrail, ISO 42001, Red Team)
- `packages[]` – one-time Stripe packages ($29 toolkit, HYDRA, n8n, content)
- `datasets[]` – training data packs sold on `/datasets.html`
- `free[]` – open source and HuggingFace surfaces
- `contact` – fallback contact info
