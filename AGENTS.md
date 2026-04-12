# Website Operator Rules

## Purpose
This repository is the public website for `aethermoore.com`. Treat it as an assistant-first site, not a generic marketing site.

The primary front door is `assistant.html`. The assistant is expected to route people into the correct surface before generating extra reasoning.

## Core Surfaces
- `assistant.html`: front desk, shopkeeper, and routing layer
- `tools.html`: live action surface
- `support.html`: recovery and troubleshooting surface
- `product-manual/`: delivery, buyer, and deployment guidance
- `research/`: proof, benchmarks, and technical justification
- `book.html`: narrative teaching surface for the same architecture

Do not flatten these into one generic pitch. The structure is intentional.

## Source Of Truth Files
- `assistant-routing.json`: deterministic route map
- `assistant-catalog.json`: public sellable buckets and gated boundaries
- `llms.txt`: assistant-facing site summary and routing rules
- `static/polly-assistant.js`: assistant UI behavior
- `static/polly-sidebar.js`: route-first sidebar operator behavior
- `sitemap.xml`: must include major public surfaces

When changing routing, product buckets, or assistant behavior, keep these files aligned.

## Editing Rules
1. Preserve the assistant-first model. If a visitor is unsure, route them to `assistant.html`.
2. Keep the site honest. Do not claim attacks are impossible or present speculative capability as proven fact.
3. Story is not filler. The book exists as the memory and teaching surface for the same system vocabulary.
4. Public custom builds are allowed. Government, DARPA, proprietary, or high-assurance work must stay gated and must not expose protected workflow details.
5. Prefer plain language over hype. The site should sound operational, not theatrical.
6. If you add or rename major surfaces, update nav links, `assistant-routing.json`, `llms.txt`, and `sitemap.xml`.

## Technical Notes
- This is a static site. Do not invent a backend unless explicitly asked.
- Assistant logic should rely on deterministic routing maps and lightweight browser logic before heavier AI reasoning.
- If you add a new assistant-facing surface, describe its purpose in both `assistant-routing.json` and `llms.txt`.

## Safe Defaults
- Route first, then explain.
- Point users to the shortest useful surface.
- Keep public sales buckets concrete and buyer-readable.
- Treat support and manuals as part of the product, not secondary pages.
