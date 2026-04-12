#!/usr/bin/env python3
"""
Auto-updating research feed for aethermoore.com.

Pulls recent AI safety / governance / security research from free sources:
- arXiv API (cs.CR, cs.AI, cs.CL recent submissions filtered by keyword)
- HackerNews via Algolia (top stories matching keywords)

Writes:
- research-feed.json    (structured data, committed to repo)
- research/latest.html  (static page rendered from the JSON)

Runs in GitHub Actions on a schedule. Stdlib only (no pip install needed).
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FEED_JSON = ROOT / "research-feed.json"
FEED_HTML = ROOT / "research" / "latest.html"

KEYWORDS = [
    "AI safety",
    "LLM security",
    "prompt injection",
    "AI governance",
    "adversarial",
    "red team",
    "jailbreak",
    "alignment",
    "hallucination",
    "AI compliance",
]

ARXIV_QUERY = (
    "http://export.arxiv.org/api/query"
    "?search_query={q}&sortBy=submittedDate&sortOrder=descending&max_results={n}"
)
HN_QUERY = "https://hn.algolia.com/api/v1/search_by_date?tags=story&query={q}&hitsPerPage={n}"
UA = "aethermoore-research-updater/1.0 (+https://aethermoore.com)"


def fetch(url: str, timeout: int = 20) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_arxiv(query: str, n: int = 5) -> list[dict]:
    encoded = urllib.parse.quote(f'abs:"{query}"')
    url = ARXIV_QUERY.format(q=encoded, n=n)
    try:
        data = fetch(url).decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[arxiv] fetch failed for {query!r}: {e}")
        return []

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    try:
        root = ET.fromstring(data)
    except ET.ParseError as e:
        print(f"[arxiv] parse failed for {query!r}: {e}")
        return []

    entries = []
    for entry in root.findall("atom:entry", ns):
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        title = re.sub(r"\s+", " ", title)
        summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
        summary = re.sub(r"\s+", " ", summary)[:280]
        published = entry.findtext("atom:published", default="", namespaces=ns) or ""
        link_el = entry.find("atom:link[@rel='alternate']", ns)
        url_entry = link_el.get("href") if link_el is not None else ""
        authors = [
            (a.findtext("atom:name", default="", namespaces=ns) or "").strip()
            for a in entry.findall("atom:author", ns)
        ]
        entries.append(
            {
                "source": "arXiv",
                "title": title,
                "summary": summary,
                "url": url_entry,
                "published": published,
                "authors": ", ".join(authors[:3]),
                "keyword": query,
            }
        )
    return entries


def fetch_hn(query: str, n: int = 5) -> list[dict]:
    encoded = urllib.parse.quote(query)
    url = HN_QUERY.format(q=encoded, n=n)
    try:
        data = json.loads(fetch(url))
    except Exception as e:
        print(f"[hn] fetch failed for {query!r}: {e}")
        return []

    entries = []
    for hit in data.get("hits", []):
        title = hit.get("title") or hit.get("story_title") or ""
        if not title:
            continue
        entries.append(
            {
                "source": "HackerNews",
                "title": title.strip(),
                "summary": f"{hit.get('points', 0)} points, {hit.get('num_comments', 0)} comments",
                "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                "published": hit.get("created_at", ""),
                "authors": hit.get("author", ""),
                "keyword": query,
            }
        )
    return entries


def dedupe(items: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for it in items:
        key = (it.get("source"), it.get("title", "").lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out


def sort_items(items: list[dict]) -> list[dict]:
    def keyer(item):
        return item.get("published") or ""
    return sorted(items, key=keyer, reverse=True)


def build_feed() -> dict:
    all_items: list[dict] = []
    for kw in KEYWORDS:
        all_items.extend(fetch_arxiv(kw, n=3))
        all_items.extend(fetch_hn(kw, n=3))

    all_items = sort_items(dedupe(all_items))[:40]

    feed = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_keywords": KEYWORDS,
        "item_count": len(all_items),
        "items": all_items,
    }
    return feed


def escape(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def render_html(feed: dict) -> str:
    items = feed.get("items", [])
    generated = feed.get("generated_at", "")

    cards: list[str] = []
    for it in items:
        pub = (it.get("published") or "")[:10]
        src = it.get("source", "")
        tag_class = "src-arxiv" if src == "arXiv" else "src-hn"
        title_html = escape(it.get("title", ""))
        url_html = escape(it.get("url", "#"))
        summary = escape(it.get("summary", ""))
        authors = escape(it.get("authors", ""))
        keyword = escape(it.get("keyword", ""))
        cards.append(
            f"""
    <a class="feed-card" href="{url_html}" target="_blank" rel="noopener">
      <div class="feed-meta">
        <span class="src-tag {tag_class}">{escape(src)}</span>
        <span class="feed-date">{escape(pub)}</span>
        <span class="feed-keyword">{keyword}</span>
      </div>
      <h3>{title_html}</h3>
      <p>{summary}</p>
      {f'<div class="feed-authors">{authors}</div>' if authors else ''}
    </a>"""
        )

    cards_html = "\n".join(cards) or '<p class="empty">No items yet. The updater runs on a schedule.</p>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Latest AI Safety Research | SCBE-AETHERMOORE</title>
  <meta name="description" content="Auto-updating feed of recent AI safety, governance, and security research from arXiv and HackerNews. Refreshed daily via GitHub Actions.">
  <link rel="canonical" href="https://aethermoore.com/research/latest.html">
  <meta property="og:title" content="Latest AI Safety Research | SCBE-AETHERMOORE">
  <meta property="og:description" content="Auto-updating feed of AI safety and governance research. Refreshed daily.">
  <meta property="og:url" content="https://aethermoore.com/research/latest.html">
  <meta property="og:image" content="https://aethermoore.com/hero.png">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Latest AI Safety Research | SCBE-AETHERMOORE">
  <meta name="twitter:description" content="Auto-updating feed of AI safety and governance research.">
  <meta name="twitter:image" content="https://aethermoore.com/hero.png">
  <style>
    :root {{
      --bg: #071412; --bg-deep: #04100f; --panel: rgba(10, 28, 24, 0.82);
      --line: rgba(139, 255, 223, 0.15); --line-bright: rgba(139, 255, 223, 0.30);
      --text: #e7fff7; --muted: #9bc5ba; --dim: #6a9488;
      --mint: #8fffd3; --aqua: #6dd8ff; --gold: #ffd977; --rose: #ff9ec7;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(180deg, var(--bg-deep), var(--bg));
      color: var(--text); line-height: 1.6; min-height: 100vh;
    }}
    a {{ color: inherit; text-decoration: none; }}
    .topbar {{
      position: sticky; top: 0; z-index: 100;
      backdrop-filter: blur(16px); background: rgba(4, 16, 15, 0.85);
      border-bottom: 1px solid var(--line);
    }}
    .topbar-inner {{
      max-width: 1100px; margin: 0 auto; padding: 14px 20px;
      display: flex; justify-content: space-between; align-items: center; gap: 16px;
    }}
    .brand {{ font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--mint); font-weight: 700; }}
    .nav {{ display: flex; gap: 6px; flex-wrap: wrap; }}
    .nav a {{ padding: 6px 12px; border-radius: 8px; font-size: 13px; color: var(--muted); }}
    .nav a:hover {{ color: var(--text); background: rgba(143, 255, 211, 0.08); }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 60px 20px; }}
    .hero-label {{
      display: inline-block; font-size: 11px; font-weight: 700;
      letter-spacing: 0.2em; text-transform: uppercase; color: var(--mint);
      padding: 4px 12px; border-radius: 20px; background: rgba(143, 255, 211, 0.08);
      border: 1px solid rgba(143, 255, 211, 0.15); margin-bottom: 16px;
    }}
    h1 {{
      font-size: clamp(28px, 5vw, 48px); font-weight: 800;
      letter-spacing: -0.03em; margin-bottom: 12px;
      background: linear-gradient(135deg, var(--mint), var(--aqua));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }}
    .subtitle {{ color: var(--muted); margin-bottom: 8px; max-width: 64ch; font-size: 17px; }}
    .generated {{ color: var(--dim); font-size: 12px; margin-bottom: 40px; }}
    .feed-grid {{ display: grid; gap: 16px; grid-template-columns: 1fr; }}
    @media (min-width: 760px) {{ .feed-grid {{ grid-template-columns: 1fr 1fr; }} }}
    .feed-card {{
      display: block; padding: 22px; border-radius: 16px;
      background: var(--panel); border: 1px solid var(--line);
      transition: all 200ms;
    }}
    .feed-card:hover {{
      border-color: var(--line-bright);
      transform: translateY(-2px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
    }}
    .feed-meta {{ display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; font-size: 11px; align-items: center; }}
    .src-tag {{
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
      padding: 3px 8px; border-radius: 6px;
    }}
    .src-arxiv {{ background: rgba(143, 255, 211, 0.12); color: var(--mint); border: 1px solid rgba(143, 255, 211, 0.25); }}
    .src-hn {{ background: rgba(255, 217, 119, 0.12); color: var(--gold); border: 1px solid rgba(255, 217, 119, 0.25); }}
    .feed-date {{ color: var(--dim); }}
    .feed-keyword {{ color: var(--aqua); }}
    .feed-card h3 {{ font-size: 16px; font-weight: 700; margin-bottom: 8px; line-height: 1.35; }}
    .feed-card p {{ font-size: 13px; color: var(--muted); line-height: 1.55; }}
    .feed-authors {{ font-size: 11px; color: var(--dim); margin-top: 10px; font-style: italic; }}
    .empty {{ padding: 40px; text-align: center; color: var(--muted); }}
    footer {{
      margin-top: 80px; padding: 24px 20px; border-top: 1px solid var(--line);
      color: var(--dim); font-size: 12px; text-align: center;
    }}
    footer a {{ color: var(--muted); }}
    footer a:hover {{ color: var(--mint); }}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/">SCBE-AETHERMOORE</a>
      <nav class="nav">
        <a href="/">Home</a>
        <a href="/research/index.html">Research</a>
        <a href="/research/latest.html">Latest</a>
        <a href="/research/forum.html">Forum</a>
        <a href="https://github.com/issdandavis/SCBE-AETHERMOORE" target="_blank" rel="noopener">GitHub</a>
      </nav>
    </div>
  </header>
  <main>
    <span class="hero-label">Auto-updated feed</span>
    <h1>Latest AI safety research</h1>
    <p class="subtitle">Recent papers and discussions on AI governance, LLM security, prompt injection, red teaming, and alignment &mdash; refreshed daily from arXiv and HackerNews.</p>
    <div class="generated">Last updated: {escape(generated)}</div>
    <div class="feed-grid">{cards_html}</div>
  </main>
  <footer>
    This page is auto-generated by <a href="https://github.com/issdandavis/issdandavis.github.io/blob/main/scripts/update_research_feed.py">update_research_feed.py</a> &mdash; runs daily via GitHub Actions.
    <br>
    Data sources: <a href="https://arxiv.org/" target="_blank" rel="noopener">arXiv</a> &middot; <a href="https://news.ycombinator.com/" target="_blank" rel="noopener">HackerNews</a>
  </footer>
</body>
</html>
"""


def main() -> int:
    print("[updater] building feed...")
    feed = build_feed()
    print(f"[updater] got {feed['item_count']} items")

    FEED_JSON.write_text(json.dumps(feed, indent=2), encoding="utf-8")
    print(f"[updater] wrote {FEED_JSON}")

    html = render_html(feed)
    FEED_HTML.parent.mkdir(parents=True, exist_ok=True)
    FEED_HTML.write_text(html, encoding="utf-8")
    print(f"[updater] wrote {FEED_HTML}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
