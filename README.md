# aethermoore.com — Assistant-First Public Site

> Source for [aethermoore.com](https://aethermoore.com), deployed through GitHub Pages.

## What this is

This repository contains the static, route-aware public site for
**SCBE-AETHERMOORE**. The primary front door is
[`assistant.html`](https://aethermoore.com/assistant.html), which routes people
to tools, products, manuals, support, research, or gated work before extra
reasoning is generated.

The site covers:

- Deterministic assistant routing and public product buckets
- Live tools, manuals, support, and delivery guidance
- Research, benchmark, and verification surfaces
- Publication-safe Kaggle, product, npm, GitHub, and capability evidence
- Links to public packages, source repositories, datasets, and contact routes

## The product itself

**[→ SCBE-AETHERMOORE (main repo)](https://github.com/issdandavis/SCBE-AETHERMOORE)**

Bounded AI in governed loops. The framework evaluates workflow actions through
a layered control pipeline, scores risk, and routes behavior toward execution,
review, throttling, or containment. It produces audit-oriented receipts while
keeping speculative and verified capability claims separate.

See the [SCBE evidence ledger](https://aethermoore.com/research/evidence.html)
and [Operations Evidence](https://aethermoore.com/research/operations.html)
before relying on a benchmark claim.

## Tech

- Pure HTML/CSS/JS — no build step, deploys instantly via GitHub Pages
- CNAME → `aethermoore.com`

## Refresh operations evidence

The public evidence page is generated from the publication-safe Kaggle
Operations Hub export. It includes a hash-locked rules/evaluation Research
Watch and keeps metadata-only forum review blocked before submission review.
The sync refuses local paths, credentials, private repository names,
non-public repositories, and competition links outside Kaggle.

```powershell
.\scripts\sync-kaggle-operations-evidence.ps1 -Source <path-to-website_benchmarks.json>
.\scripts\test-operations-evidence.ps1
```

The copied JSON and its hash receipt live under `research/data/`. CI reruns the
same validation whenever the page, renderer, routing files, or evidence data
changes.

## Links

- **Live site:** https://aethermoore.com
- **npm:** `npm install scbe-aethermoore`
- **PyPI:** `pip install scbe-aethermoore`
- **GitHub Sponsors:** https://github.com/sponsors/issdandavis
- **Ko-fi:** https://ko-fi.com/izdandavis
- **X/Twitter:** [@davisissac](https://x.com/davisissac)

---

Built by [Issac Daniel Davis](https://github.com/issdandavis) · Patent pending USPTO #63/961,403
