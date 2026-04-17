#!/usr/bin/env python3
"""
Polly backend server.

FastAPI service that powers the Polly sidebar chat on aethermoore.com.
Provides grounded answers from the real product catalog AND drives the
Sacred Egg training data flywheel:

  Visitor message
    → Ollama LLM (server-side, we supply the AI)
    → Sacred Tongues tokenization (tongue assigned by content)
    → Sacred Egg seal (HKDF + AEAD, GeoSeal-style)
    → Append to egg store (eggs/interactions.jsonl)
    → When clutch full (CLUTCH_SIZE eggs) → mark bundle as protein-ready
    → Return {response, egg_id} to frontend

The matching GeoSeal key egg (held in our training pipeline) unseals
the protein bundles and ingests them as SFT pairs.

Endpoints:
  GET  /health                     - liveness check
  GET  /v1/polly/catalog           - full product catalog (from catalog.json)
  POST /v1/polly/search            - keyword match across catalog items
  POST /v1/polly/quote             - pricing lookup for a named solution/product
  GET  /v1/polly/package/{manager}/{name}
       - live npm or PyPI package metadata (version, downloads, description)
  POST /v1/polly/respond           - catalog-grounded answer (no LLM, fast)
  POST /v1/polly/chat              - FULL PIPELINE: LLM + egg sealing + protein bundle

Runs anywhere Python runs. Designed to be:
- Started locally:   python server.py
- Exposed publicly:  via cloudflared tunnel or ngrok
- Run in GitHub Actions as an ephemeral compute endpoint (see
  .github/workflows/polly-backend.yml in the site repo)

Dependencies: fastapi, uvicorn, httpx
    pip install fastapi uvicorn[standard] httpx
"""

from __future__ import annotations

import hashlib
import hmac as _hmac
import json
import os
import struct
import time
import uuid
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

# -- Sacred Egg / Training Flywheel config -----------------------------------

EGG_STORE_DIR = Path(os.environ.get("POLLY_EGG_DIR", Path(__file__).resolve().parent / "eggs"))
EGG_STORE_PATH = EGG_STORE_DIR / "interactions.jsonl"
PROTEIN_DIR = EGG_STORE_DIR / "protein"
CLUTCH_SIZE = int(os.environ.get("POLLY_CLUTCH_SIZE", "12"))  # eggs per bundle
# Sealing key seed — set POLLY_EGG_KEY_SEED in env (never commit the real value)
_EGG_KEY_SEED = os.environ.get("POLLY_EGG_KEY_SEED", "aethermoore-polly-default-seed-change-me")

# Sacred Tongue keyword classifier — maps content to tongue code
_TONGUE_KEYWORDS: list[tuple[str, list[str]]] = [
    ("ko", ["security", "governance", "policy", "compliance", "audit", "safe", "rule", "guardrail"]),
    ("av", ["emotion", "story", "feel", "experience", "art", "creative", "design", "beautiful"]),
    ("ru", ["code", "function", "class", "api", "implement", "build", "test", "deploy", "rust"]),
    ("ca", ["math", "formula", "equation", "proof", "theorem", "calculate", "number", "geometry"]),
    ("um", ["pure", "functional", "haskell", "abstract", "type", "category", "formal", "logic"]),
    ("dr", ["story", "lore", "chapter", "book", "narrative", "world", "character", "quest", "write"]),
]

# Ollama config (server-side — we run the model, visitors just chat)
OLLAMA_BASE = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("POLLY_MODEL", "llama3.2:3b")

POLLY_SYSTEM_PROMPT = """You are Polly, the AI assistant for Aethermoore — an AI governance and security
framework built on hyperbolic geometry and Sacred Tongues cryptography.
You are knowledgeable, precise, and grounded. You help visitors understand:
- The 14-layer SCBE security pipeline
- Sacred Tongues tokenization (Kor'aelin, Avali, Runethic, Cassisivadan, Umbroth, Draumric)
- Pricing and packages for M5 Mesh Foundry and related products
- How to get started with the framework
Keep answers concise (under 200 words unless asked for detail). Be helpful and direct."""

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


# -- Sacred Egg crypto primitives (self-contained, no external deps) ---------


def _hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int = 32) -> bytes:
    if not salt:
        salt = b"\x00" * 32
    prk = _hmac.new(salt, ikm, hashlib.sha256).digest()
    t, okm, counter = b"", b"", 1
    while len(okm) < length:
        t = _hmac.new(prk, t + info + bytes([counter]), hashlib.sha256).digest()
        okm += t
        counter += 1
    return okm[:length]


def _egg_seal(payload: dict[str, Any], tongue: str, key_seed: str) -> tuple[str, str]:
    """
    Seal an interaction record as a Sacred Egg.

    Returns (egg_id, hex-encoded ciphertext).
    The unsealing key is derived from (key_seed + tongue) — only our
    training pipeline (which holds key_seed) can unseal.
    """
    egg_id = str(uuid.uuid4())
    nonce = os.urandom(16)
    salt = hashlib.sha256(tongue.encode() + b":polly-egg-salt").digest()
    ikm = hashlib.sha256(key_seed.encode() + b":" + tongue.encode()).digest()
    key = _hkdf_sha256(ikm, salt, b"polly-sacred-egg:enc", 32)
    k_mac = _hkdf_sha256(ikm, salt, b"polly-sacred-egg:mac", 32)

    plaintext = json.dumps({"egg_id": egg_id, **payload}, ensure_ascii=False).encode()
    ct = bytearray(len(plaintext))
    for i in range(0, len(plaintext), 32):
        blk = i // 32
        ks = hashlib.sha256(key + struct.pack("<Q", blk)).digest()
        for j in range(min(32, len(plaintext) - i)):
            ct[i + j] = plaintext[i + j] ^ ks[j]

    aad = (egg_id + ":" + tongue).encode()
    mac = _hmac.new(k_mac, aad + nonce + bytes(ct), hashlib.sha256).digest()
    blob = nonce + bytes(ct) + mac
    return egg_id, blob.hex()


def _classify_tongue(text: str) -> str:
    """Assign a Sacred Tongue based on content keywords."""
    lower = text.lower()
    scores: dict[str, int] = {code: 0 for code, _ in _TONGUE_KEYWORDS}
    for code, keywords in _TONGUE_KEYWORDS:
        for kw in keywords:
            if kw in lower:
                scores[code] += 1
    best = max(scores, key=lambda c: scores[c])
    return best if scores[best] > 0 else "ko"  # default to Kor'aelin (governance)


# -- Egg store (JSONL accumulator) -------------------------------------------


def _ensure_egg_dirs() -> None:
    EGG_STORE_DIR.mkdir(parents=True, exist_ok=True)
    PROTEIN_DIR.mkdir(parents=True, exist_ok=True)


def _append_egg(egg_id: str, tongue: str, sealed_hex: str) -> int:
    """Append sealed egg to store. Returns current egg count."""
    _ensure_egg_dirs()
    entry = {"egg_id": egg_id, "tongue": tongue, "ts": time.time(), "sealed": sealed_hex}
    with EGG_STORE_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry) + "\n")

    # Count current eggs
    lines = EGG_STORE_PATH.read_text(encoding="utf-8").strip().splitlines()
    return len(lines)


def _bundle_protein_if_ready(egg_count: int) -> str | None:
    """When clutch is full, move eggs to a protein bundle file."""
    if egg_count < CLUTCH_SIZE:
        return None

    _ensure_egg_dirs()
    lines = EGG_STORE_PATH.read_text(encoding="utf-8").strip().splitlines()
    if len(lines) < CLUTCH_SIZE:
        return None

    bundle_id = f"protein_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    bundle_path = PROTEIN_DIR / f"{bundle_id}.jsonl"
    bundle_path.write_text("\n".join(lines[:CLUTCH_SIZE]) + "\n", encoding="utf-8")

    # Remove bundled eggs from store
    remaining = lines[CLUTCH_SIZE:]
    EGG_STORE_PATH.write_text("\n".join(remaining) + ("\n" if remaining else ""), encoding="utf-8")

    return bundle_id


# -- Ollama LLM caller --------------------------------------------------------


async def _call_ollama(user_message: str, catalog_context: str = "") -> str | None:
    """Call Ollama server-side. Returns response text or None on failure."""
    system = POLLY_SYSTEM_PROMPT
    if catalog_context:
        system += f"\n\nRELEVANT CATALOG CONTEXT:\n{catalog_context}"

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ],
        "stream": False,
        "options": {"num_predict": 400, "temperature": 0.7},
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(f"{OLLAMA_BASE}/api/chat", json=payload)
            if resp.status_code == 200:
                data = resp.json()
                return (data.get("message") or {}).get("content") or data.get("response")
    except Exception:
        pass
    return None


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


class ChatRequest(BaseModel):
    message: str
    context: str | None = None  # 'site', 'deep-think', etc.
    page_url: str | None = None


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

    # Egg store stats
    egg_count = 0
    protein_count = 0
    try:
        if EGG_STORE_PATH.exists():
            egg_count = len(EGG_STORE_PATH.read_text(encoding="utf-8").strip().splitlines())
        if PROTEIN_DIR.exists():
            protein_count = len(list(PROTEIN_DIR.glob("*.jsonl")))
    except Exception:
        pass

    return {
        "status": "ok",
        "catalog_version": cat.get("version"),
        "counts": {
            "solutions": len(cat.get("solutions", [])),
            "packages": len(cat.get("packages", [])),
            "datasets": len(cat.get("datasets", [])),
            "free": len(cat.get("free", [])),
        },
        "eggs": {"pending": egg_count, "clutch_size": CLUTCH_SIZE, "protein_bundles": protein_count},
        "ollama": {"base": OLLAMA_BASE, "model": OLLAMA_MODEL},
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


@app.post("/v1/polly/chat")
async def chat(req: ChatRequest) -> dict[str, Any]:
    """
    Full Polly pipeline:
      1. Pull catalog context for grounding
      2. Call Ollama (server-side LLM — we supply the AI)
      3. Sacred Tongues classification of the exchange
      4. Sacred Egg seal of the interaction record
      5. Append to egg store; bundle protein when clutch is full
      6. Return response + egg metadata to frontend
    """
    # 1. Catalog grounding — find relevant items to give Ollama context
    catalog = load_catalog()
    matches = match_items(catalog, req.message, limit=3)
    catalog_ctx = ""
    if matches:
        catalog_ctx = "\n".join(format_item_summary(m) for m in matches[:2])

    # 2. LLM generation via Ollama
    llm_response = await _call_ollama(req.message, catalog_context=catalog_ctx)

    if not llm_response:
        # Graceful fallback — catalog-grounded answer without LLM
        if matches:
            llm_response = format_item_summary(matches[0])
        else:
            contact = catalog.get("contact", {}).get("email", "aethermore@pm.me")
            llm_response = (
                f"I'm having trouble connecting to my language model right now. "
                f"For immediate help, email {contact} or visit https://aethermoore.com/."
            )

    # 3. Sacred Tongue classification
    tongue = _classify_tongue(req.message + " " + llm_response)

    # 4. Seal the interaction as a Sacred Egg
    payload = {
        "user_message": req.message,
        "polly_response": llm_response,
        "tongue": tongue,
        "context": req.context or "site",
        "page_url": req.page_url or "",
        "ts": time.time(),
        "model": OLLAMA_MODEL,
    }
    egg_id, sealed_hex = _egg_seal(payload, tongue, _EGG_KEY_SEED)

    # 5. Append to store; bundle if clutch complete
    egg_count = _append_egg(egg_id, tongue, sealed_hex)
    protein_bundle = _bundle_protein_if_ready(egg_count)

    return {
        "response": llm_response,
        "egg_id": egg_id,
        "tongue": tongue,
        "egg_count": egg_count,
        "protein_bundle": protein_bundle,  # non-null when a clutch was sealed
        "catalog_matches": len(matches),
    }


# -- Entrypoint --------------------------------------------------------------


def main() -> None:
    import uvicorn

    host = os.environ.get("POLLY_HOST", "0.0.0.0")
    port = int(os.environ.get("POLLY_PORT", "8001"))
    uvicorn.run("server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
