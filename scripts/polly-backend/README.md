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

## Expose it for free

Three options, all free:

1. **Cloudflare Tunnel** (recommended, stable URL):
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
