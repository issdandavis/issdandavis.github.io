#!/usr/bin/env python3
"""
Polly backend server.

FastAPI service that powers the Polly sidebar chat on aethermoore.com.
Provides grounded answers from the real product catalog so the frontend
LLM can route users to correct prices, URLs, and package metadata without
hallucinating inventory.

Endpoints:
  GET  /health                     - liveness check
  GET  /v1/polly/catalog           - full product catalog (from catalog.json)
  POST /v1/polly/search            - keyword match across catalog items
  POST /v1/polly/quote             - pricing lookup for a named solution/product
  GET  /v1/polly/package/{manager}/{name}
       - live npm or PyPI package metadata (version, downloads, description)
  POST /v1/polly/respond           - main entrypoint: routes a user message
                                     to the right catalog item and returns
                                     a grounded answer the frontend can show

Runs anywhere Python runs. Designed to be:
- Started locally:   python server.py
- Exposed publicly:  via cloudflared tunnel or ngrok
- Run in GitHub Actions as an ephemeral compute endpoint (see
  .github/workflows/polly-backend.yml in the site repo)

Dependencies: fastapi, uvicorn, httpx
    pip install fastapi uvicorn[standard] httpx
"""

from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    import httpx
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError as e:
    print("Missing dependencies. Install with:")
    print("  pip install fastapi 'uvicorn[standard]' httpx")
    raise SystemExit(1) from e

CATALOG_PATH = Path(__file__).resolve().parent / "catalog.json"
CACHE_TTL = 3600  # package info cache lifetime in seconds

app = FastAPI(
    title="Polly backend",
    description="Catalog-grounded backend for the aethermoore.com Polly assistant.",
    version="1.0.0",
)

# Allow the static site to call this backend from the browser.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aethermoore.com",
        "https://www.aethermoore.com",
        "http://localhost",
        "http://localhost:8000",
        "http://127.0.0.1",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


# -- Catalog loading ---------------------------------------------------------


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, Any]:
    if not CATALOG_PATH.exists():
        raise RuntimeError(f"Catalog file missing: {CATALOG_PATH}")
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def all_items(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for section in ("solutions", "packages", "datasets", "free"):
        for item in catalog.get(section, []):
            items.append({**item, "_section": section})
    return items


def match_items(catalog: dict[str, Any], query: str, limit: int = 5) -> list[dict[str, Any]]:
    q = (query or "").lower().strip()
    if not q:
        return []

    tokens = [t for t in q.replace(",", " ").split() if t]
    scored: list[tuple[int, dict[str, Any]]] = []

    for item in all_items(catalog):
        score = 0
        haystack = " ".join(
            [
                item.get("name", ""),
                item.get("pitch", ""),
                " ".join(item.get("keywords", []) or []),
                item.get("vertical", ""),
            ]
        ).lower()

        if not haystack:
            continue

        # Exact phrase bonus
        if q in haystack:
            score += 5

        # Per-token matches
        for tok in tokens:
            if tok in haystack:
                score += 1

        if score > 0:
            scored.append((score, item))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _score, item in scored[:limit]]


# -- Package metadata fetchers (cached) --------------------------------------


_package_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_get(key: str) -> dict[str, Any] | None:
    entry = _package_cache.get(key)
    if entry is None:
        return None
    when, payload = entry
    if time.time() - when > CACHE_TTL:
        _package_cache.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict[str, Any]) -> None:
    _package_cache[key] = (time.time(), payload)


async def fetch_npm(name: str) -> dict[str, Any]:
    cached = _cache_get(f"npm:{name}")
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=15.0) as client:
        meta = (await client.get(f"https://registry.npmjs.org/{name}")).json()
        downloads: dict[str, Any] = {}
        try:
            dl = await client.get(f"https://api.npmjs.org/downloads/point/last-week/{name}")
            if dl.status_code == 200:
                downloads = dl.json()
        except Exception:
            downloads = {}

    latest = (meta.get("dist-tags") or {}).get("latest", "")
    version_info = (meta.get("versions") or {}).get(latest, {})
    payload = {
        "manager": "npm",
        "name": name,
        "latest": latest,
        "description": meta.get("description") or version_info.get("description") or "",
        "homepage": meta.get("homepage") or "",
        "license": version_info.get("license") or meta.get("license") or "",
        "last_week_downloads": downloads.get("downloads"),
        "registry_url": f"https://www.npmjs.com/package/{name}",
    }
    _cache_set(f"npm:{name}", payload)
    return payload


async def fetch_pypi(name: str) -> dict[str, Any]:
    cached = _cache_get(f"pypi:{name}")
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"https://pypi.org/pypi/{name}/json")
        if resp.status_code != 200:
            raise HTTPException(status_code=404, detail=f"PyPI package not found: {name}")
        data = resp.json()

    info = data.get("info") or {}
    payload = {
        "manager": "pypi",
        "name": name,
        "latest": info.get("version", ""),
        "description": info.get("summary") or "",
        "homepage": info.get("home_page") or info.get("project_url") or "",
        "license": info.get("license") or "",
        "registry_url": f"https://pypi.org/project/{name}/",
    }
    _cache_set(f"pypi:{name}", payload)
    return payload


# -- Request models ----------------------------------------------------------


class SearchRequest(BaseModel):
    query: str
    limit: int = 5


class QuoteRequest(BaseModel):
    item: str  # name, id, or vertical keyword


class RespondRequest(BaseModel):
    text: str
    surface: str | None = None
    page_url: str | None = None
    page_title: str | None = None


# -- Response helpers --------------------------------------------------------


def format_tiers(item: dict[str, Any]) -> str:
    tiers = item.get("tiers") or []
    if not tiers:
        return ""
    lines = []
    for tier in tiers:
        unit = tier.get("unit", "")
        price = tier.get("price", 0)
        unit_suffix = f"/{unit}" if unit in ("month", "year") else f" {unit}"
        lines.append(f"- {tier['name']}: ${price:,}{unit_suffix}")
    return "\n".join(lines)


def format_item_summary(item: dict[str, Any]) -> str:
    parts = [f"**{item.get('name', '')}**"]
    if pitch := item.get("pitch"):
        parts.append(pitch)

    if tiers := item.get("tiers"):
        tier_strs = []
        for tier in tiers:
            unit = tier.get("unit", "")
            price = tier.get("price", 0)
            unit_suffix = f"/{unit}" if unit in ("month", "year") else f" {unit}"
            tier_strs.append(f"{tier['name']} ${price:,}{unit_suffix}")
        parts.append("Tiers: " + " · ".join(tier_strs))
    elif "price" in item:
        unit = item.get("unit", "one-time")
        parts.append(f"Price: ${item['price']}" + (f"/{unit}" if unit not in ("one-time",) else ""))

    if url := item.get("url"):
        parts.append(f"Details: {url}")

    return "\n".join(parts)


# -- Endpoints ---------------------------------------------------------------


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        cat = load_catalog()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "status": "ok",
        "catalog_version": cat.get("version"),
        "counts": {
            "solutions": len(cat.get("solutions", [])),
            "packages": len(cat.get("packages", [])),
            "datasets": len(cat.get("datasets", [])),
            "free": len(cat.get("free", [])),
        },
    }


@app.get("/v1/polly/catalog")
def get_catalog() -> dict[str, Any]:
    return load_catalog()


@app.post("/v1/polly/search")
def search(req: SearchRequest) -> dict[str, Any]:
    catalog = load_catalog()
    results = match_items(catalog, req.query, limit=req.limit)
    return {"query": req.query, "count": len(results), "results": results}


@app.post("/v1/polly/quote")
def quote(req: QuoteRequest) -> dict[str, Any]:
    catalog = load_catalog()
    hits = match_items(catalog, req.item, limit=1)
    if not hits:
        raise HTTPException(
            status_code=404,
            detail=f"No catalog item matches {req.item!r}. Try: 'cx guardrail', 'iso 42001', 'red team', 'training data', 'toolkit'.",
        )
    item = hits[0]
    return {
        "item": item,
        "summary": format_item_summary(item),
        "tiers_text": format_tiers(item),
    }


@app.get("/v1/polly/package/{manager}/{name}")
async def package_info(manager: str, name: str) -> dict[str, Any]:
    manager = manager.lower()
    if manager == "npm":
        return await fetch_npm(name)
    if manager in ("pypi", "pip", "python"):
        return await fetch_pypi(name)
    raise HTTPException(status_code=400, detail="Unknown manager. Use 'npm' or 'pypi'.")


@app.post("/v1/polly/respond")
def respond(req: RespondRequest) -> dict[str, Any]:
    """
    Main chat entrypoint. Takes a user message, finds the best catalog match,
    and returns a grounded answer the frontend can display directly.
    """
    catalog = load_catalog()
    results = match_items(catalog, req.text, limit=3)

    if not results:
        contact = catalog.get("contact", {}).get("email", "aethermoregames@pm.me")
        return {
            "intent": "no_match",
            "text": (
                "I don't have a direct product match for that. "
                f"For custom work or questions, email {contact} or check the open source framework "
                "at https://github.com/issdandavis/SCBE-AETHERMOORE."
            ),
            "matches": [],
        }

    top = results[0]
    lines = [format_item_summary(top)]
    if len(results) > 1:
        lines.append("\nOther options:")
        for item in results[1:]:
            name = item.get("name", "")
            url = item.get("url", "")
            lines.append(f"- {name}: {url}")

    return {
        "intent": "catalog_match",
        "text": "\n".join(lines),
        "matches": results,
        "primary": top,
    }


# -- Entrypoint --------------------------------------------------------------


def main() -> None:
    import uvicorn

    host = os.environ.get("POLLY_HOST", "0.0.0.0")
    port = int(os.environ.get("POLLY_PORT", "8001"))
    uvicorn.run("server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
