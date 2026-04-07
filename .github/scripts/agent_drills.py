#!/usr/bin/env python3
"""
HYDRA Agent Training Drills
============================
Three drill loops that run free on GitHub Actions, keep the site healthy,
and generate SFT training pairs for HYDRA agents.

Drill 1 — Site Patrol (AV + KO tongues): crawl, verify links, check SEO
Drill 2 — Security Sweep (UM + RU tongues): headers, secrets scan, TLS
Drill 3 — SCBE System Review (CA + DR tongues): test counts, coverage, freshness

All output goes to drills/ as JSON reports + JSONL training pairs.
"""

import json
import os
import re
import ssl
import socket
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

SITE = os.environ.get("SITE_URL", "https://aethermoore.com")
DRILL = os.environ.get("DRILL", "all")
DRILLS_DIR = Path("drills")
DRILLS_DIR.mkdir(exist_ok=True)
NOW = datetime.now(timezone.utc).isoformat()
DATE_TAG = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# Sacred Tongue assignment for SFT tagging
TONGUE_MAP = {
    "patrol": {"primary": "AV", "secondary": "KO"},
    "security": {"primary": "UM", "secondary": "RU"},
    "review": {"primary": "CA", "secondary": "DR"},
}

sft_pairs = []


def sft(tongue, instruction, response, drill_name):
    """Generate an SFT training pair."""
    sft_pairs.append({
        "timestamp": NOW,
        "tongue": tongue,
        "drill": drill_name,
        "instruction": instruction,
        "response": response,
        "success": True,
    })


# ─── DRILL 1: SITE PATROL ─────────────────────────────────────────────

def drill_patrol():
    print("=== DRILL 1: Site Patrol (AV/KO) ===")
    report = {
        "drill": "patrol",
        "timestamp": NOW,
        "pages_checked": 0,
        "links_ok": 0,
        "links_broken": [],
        "missing_meta": [],
        "missing_og": [],
        "missing_canonical": [],
        "sitemap_pages": 0,
        "actual_pages": 0,
    }

    # Parse sitemap
    try:
        r = requests.get(f"{SITE}/sitemap.xml", timeout=15)
        soup = BeautifulSoup(r.text, "lxml-xml")
        sitemap_urls = [loc.text for loc in soup.find_all("loc")]
        report["sitemap_pages"] = len(sitemap_urls)
    except Exception as e:
        sitemap_urls = []
        report["sitemap_error"] = str(e)

    # Crawl each page
    checked_links = set()
    for url in sitemap_urls:
        try:
            r = requests.get(url, timeout=15)
            report["pages_checked"] += 1

            if r.status_code != 200:
                report["links_broken"].append({"url": url, "status": r.status_code, "type": "page"})
                continue

            page = BeautifulSoup(r.text, "html.parser")

            # Check meta tags
            if not page.find("meta", attrs={"name": "description"}):
                report["missing_meta"].append(url)
            if not page.find("meta", attrs={"property": "og:title"}):
                report["missing_og"].append(url)
            if not page.find("link", attrs={"rel": "canonical"}):
                report["missing_canonical"].append(url)

            # Check internal links
            for a in page.find_all("a", href=True):
                href = a["href"]
                if href.startswith("#") or href.startswith("mailto:") or href.startswith("javascript:"):
                    continue
                full = urljoin(url, href)
                parsed = urlparse(full)
                if parsed.netloc and "aethermoore.com" not in parsed.netloc:
                    continue  # skip external
                if full in checked_links:
                    continue
                checked_links.add(full)
                try:
                    lr = requests.head(full, timeout=10, allow_redirects=True)
                    if lr.status_code < 400:
                        report["links_ok"] += 1
                    else:
                        report["links_broken"].append({
                            "url": full,
                            "status": lr.status_code,
                            "found_on": url,
                            "type": "internal_link",
                        })
                except Exception:
                    report["links_broken"].append({
                        "url": full,
                        "status": "timeout",
                        "found_on": url,
                        "type": "internal_link",
                    })

        except Exception as e:
            report["links_broken"].append({"url": url, "status": str(e), "type": "page"})

    # Count actual HTML files from sitemap
    report["actual_pages"] = report["pages_checked"]

    # Generate SFT pairs
    sft("AV", "Crawl aethermoore.com and report broken links",
        f"Checked {report['pages_checked']} pages. {report['links_ok']} links OK, "
        f"{len(report['links_broken'])} broken. "
        f"{len(report['missing_meta'])} pages missing meta description.",
        "patrol")

    if report["links_broken"]:
        sft("KO", "List broken links found on aethermoore.com",
            json.dumps(report["links_broken"][:10], indent=2), "patrol")

    if report["missing_canonical"]:
        sft("AV", "Which pages are missing canonical URLs?",
            json.dumps(report["missing_canonical"], indent=2), "patrol")

    print(f"  Pages: {report['pages_checked']}, Links OK: {report['links_ok']}, "
          f"Broken: {len(report['links_broken'])}")
    return report


# ─── DRILL 2: SECURITY SWEEP ──────────────────────────────────────────

def drill_security():
    print("=== DRILL 2: Security Sweep (UM/RU) ===")
    report = {
        "drill": "security",
        "timestamp": NOW,
        "headers": {},
        "tls": {},
        "secrets_found": [],
        "score": 0,
        "max_score": 0,
    }

    # Check security headers
    expected_headers = {
        "strict-transport-security": "HSTS",
        "x-content-type-options": "X-Content-Type-Options",
        "x-frame-options": "X-Frame-Options",
        "content-security-policy": "CSP",
        "referrer-policy": "Referrer-Policy",
        "permissions-policy": "Permissions-Policy",
    }

    try:
        r = requests.get(SITE, timeout=15)
        for header_key, label in expected_headers.items():
            report["max_score"] += 1
            val = r.headers.get(header_key)
            if val:
                report["headers"][label] = {"present": True, "value": val}
                report["score"] += 1
            else:
                report["headers"][label] = {"present": False, "value": None}
    except Exception as e:
        report["header_error"] = str(e)

    # TLS check
    try:
        hostname = urlparse(SITE).hostname
        ctx = ssl.create_default_context()
        with ctx.wrap_socket(socket.socket(), server_hostname=hostname) as s:
            s.settimeout(10)
            s.connect((hostname, 443))
            cert = s.getpeercert()
            report["tls"]["valid"] = True
            report["tls"]["issuer"] = dict(x[0] for x in cert.get("issuer", []))
            report["tls"]["expires"] = cert.get("notAfter", "unknown")
            report["tls"]["subject"] = dict(x[0] for x in cert.get("subject", []))
            report["score"] += 1
            report["max_score"] += 1
    except Exception as e:
        report["tls"]["valid"] = False
        report["tls"]["error"] = str(e)
        report["max_score"] += 1

    # Scan for exposed secrets in page source
    secret_patterns = [
        (r'(?:api[_-]?key|apikey)\s*[:=]\s*["\']([a-zA-Z0-9_\-]{20,})', "API key"),
        (r'(?:secret|token|password)\s*[:=]\s*["\']([^\'"]{8,})', "Secret/Token"),
        (r'sk-[a-zA-Z0-9]{20,}', "OpenAI key"),
        (r'hf_[a-zA-Z0-9]{20,}', "HuggingFace token"),
        (r'ghp_[a-zA-Z0-9]{20,}', "GitHub PAT"),
        (r'AKIA[0-9A-Z]{16}', "AWS key"),
    ]

    try:
        r = requests.get(SITE, timeout=15)
        for pattern, label in secret_patterns:
            matches = re.findall(pattern, r.text, re.IGNORECASE)
            if matches:
                report["secrets_found"].append({
                    "type": label,
                    "count": len(matches),
                    "page": SITE,
                })
    except Exception:
        pass

    report["max_score"] += 1
    if not report["secrets_found"]:
        report["score"] += 1

    # Generate SFT pairs
    missing_headers = [k for k, v in report["headers"].items() if not v["present"]]
    sft("UM",
        "Run a security header audit on aethermoore.com",
        f"Score: {report['score']}/{report['max_score']}. "
        f"TLS: {'valid' if report['tls'].get('valid') else 'INVALID'}. "
        f"Missing headers: {', '.join(missing_headers) if missing_headers else 'none'}. "
        f"Secrets exposed: {len(report['secrets_found'])}.",
        "security")

    if missing_headers:
        sft("RU",
            f"What security headers should aethermoore.com add?",
            f"Missing: {', '.join(missing_headers)}. GitHub Pages controls most headers, "
            f"but you can add CSP and Permissions-Policy via <meta> tags in HTML.",
            "security")

    print(f"  Score: {report['score']}/{report['max_score']}, "
          f"Missing headers: {len(missing_headers)}, Secrets: {len(report['secrets_found'])}")
    return report


# ─── DRILL 3: SCBE SYSTEM REVIEW ──────────────────────────────────────

def drill_review():
    print("=== DRILL 3: SCBE System Review (CA/DR) ===")
    report = {
        "drill": "review",
        "timestamp": NOW,
        "site_test_count": None,
        "articles_count": 0,
        "research_pages": 0,
        "demo_pages": 0,
        "tongue_coverage": {},
        "freshness": {},
    }

    # Check what test count the site claims
    try:
        r = requests.get(SITE, timeout=15)
        page = BeautifulSoup(r.text, "html.parser")
        text = page.get_text()
        # Look for test count patterns like "29,000" or "6,066"
        counts = re.findall(r'([\d,]+)\+?\s*(?:tests?|passing)', text, re.IGNORECASE)
        if counts:
            report["site_test_count"] = counts[0]
    except Exception as e:
        report["site_error"] = str(e)

    # Count content by section
    try:
        r = requests.get(f"{SITE}/sitemap.xml", timeout=15)
        soup = BeautifulSoup(r.text, "lxml-xml")
        urls = [loc.text for loc in soup.find_all("loc")]
        for url in urls:
            if "/articles/" in url and "index" not in url:
                report["articles_count"] += 1
            elif "/research/" in url and "index" not in url:
                report["research_pages"] += 1
            elif "/demos/" in url and "index" not in url:
                report["demo_pages"] += 1
    except Exception:
        pass

    # Check Sacred Tongue coverage across site
    tongues = {"KO": 0, "AV": 0, "RU": 0, "CA": 0, "UM": 0, "DR": 0}
    tongue_names = {
        "KO": "Kor'aelin", "AV": "Avali", "RU": "Runethic",
        "CA": "Cassisivadan", "UM": "Umbroth", "DR": "Draumric",
    }
    try:
        # Check research hub for tongue mentions
        r = requests.get(f"{SITE}/research/hub.html", timeout=15)
        text = r.text
        for code, name in tongue_names.items():
            count = text.lower().count(code.lower()) + text.lower().count(name.lower())
            tongues[code] = count
    except Exception:
        pass
    report["tongue_coverage"] = tongues

    # Check sitemap freshness
    try:
        r = requests.get(f"{SITE}/sitemap.xml", timeout=15)
        soup = BeautifulSoup(r.text, "lxml-xml")
        dates = [lm.text for lm in soup.find_all("lastmod")]
        if dates:
            report["freshness"]["newest"] = max(dates)
            report["freshness"]["oldest"] = min(dates)
            report["freshness"]["total_urls"] = len(dates)
    except Exception:
        pass

    # Generate SFT pairs
    sft("CA",
        "Review the SCBE-AETHERMOORE site content inventory",
        f"Articles: {report['articles_count']}, Research: {report['research_pages']}, "
        f"Demos: {report['demo_pages']}. "
        f"Site claims {report['site_test_count'] or 'unknown'} tests. "
        f"Sitemap freshness: {report['freshness'].get('newest', 'unknown')}.",
        "review")

    low_coverage = [k for k, v in tongues.items() if v < 3]
    if low_coverage:
        sft("DR",
            "Which Sacred Tongues have low representation on the site?",
            f"Low coverage: {', '.join(low_coverage)}. "
            f"Coverage counts: {json.dumps(tongues)}. "
            f"Consider adding research content or demos for underrepresented tongues.",
            "review")

    sft("CA",
        "What is the current content health of aethermoore.com?",
        f"Total sitemap URLs: {report['freshness'].get('total_urls', 0)}. "
        f"Articles: {report['articles_count']}, Research: {report['research_pages']}, "
        f"Demos: {report['demo_pages']}. All dates current as of {report['freshness'].get('newest', 'unknown')}.",
        "review")

    print(f"  Articles: {report['articles_count']}, Research: {report['research_pages']}, "
          f"Demos: {report['demo_pages']}")
    return report


# ─── MAIN ──────────────────────────────────────────────────────────────

def main():
    print(f"HYDRA Training Drills — {DATE_TAG}")
    print(f"Target: {SITE}")
    print(f"Drill: {DRILL}")
    print()

    reports = {}

    if DRILL in ("all", "patrol"):
        reports["patrol"] = drill_patrol()
    if DRILL in ("all", "security"):
        reports["security"] = drill_security()
    if DRILL in ("all", "review"):
        reports["review"] = drill_review()

    # Write drill report
    report_file = DRILLS_DIR / f"report_{DATE_TAG}.json"
    with open(report_file, "w") as f:
        json.dump(reports, f, indent=2)
    print(f"\nReport: {report_file}")

    # Write SFT training pairs
    sft_file = DRILLS_DIR / f"sft_{DATE_TAG}.jsonl"
    with open(sft_file, "w") as f:
        for pair in sft_pairs:
            f.write(json.dumps(pair) + "\n")
    print(f"SFT pairs: {len(sft_pairs)} → {sft_file}")

    # Write latest summary for site display
    summary = {
        "date": DATE_TAG,
        "drills_run": list(reports.keys()),
        "patrol": {
            "pages": reports.get("patrol", {}).get("pages_checked", 0),
            "broken_links": len(reports.get("patrol", {}).get("links_broken", [])),
        } if "patrol" in reports else None,
        "security": {
            "score": reports.get("security", {}).get("score", 0),
            "max_score": reports.get("security", {}).get("max_score", 0),
        } if "security" in reports else None,
        "review": {
            "articles": reports.get("review", {}).get("articles_count", 0),
            "research": reports.get("review", {}).get("research_pages", 0),
            "demos": reports.get("review", {}).get("demo_pages", 0),
        } if "review" in reports else None,
        "sft_pairs_generated": len(sft_pairs),
    }
    with open(DRILLS_DIR / "latest.json", "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Summary: drills/latest.json")

    # Print scorecard
    print("\n" + "=" * 50)
    print("DRILL SCORECARD")
    print("=" * 50)
    if "patrol" in reports:
        p = reports["patrol"]
        broken = len(p.get("links_broken", []))
        print(f"  PATROL:   {p['pages_checked']} pages, {p['links_ok']} links OK, {broken} broken")
    if "security" in reports:
        s = reports["security"]
        print(f"  SECURITY: {s['score']}/{s['max_score']} checks passed")
    if "review" in reports:
        r = reports["review"]
        print(f"  REVIEW:   {r['articles_count']} articles, {r['research_pages']} research, {r['demo_pages']} demos")
    print(f"  SFT:      {len(sft_pairs)} training pairs generated")
    print("=" * 50)


if __name__ == "__main__":
    main()
