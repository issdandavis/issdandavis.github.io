(() => {
  "use strict";

  const body = document.body;
  const dataUrl = body.dataset.evidenceUrl;
  const results = document.getElementById("evidence-results");
  const count = document.getElementById("result-count");
  const search = document.getElementById("evidence-search");
  const tabs = Array.from(document.querySelectorAll("[data-view]"));
  const stats = Array.from(document.querySelectorAll("#summary-stats strong"));
  const policyList = document.getElementById("policy-list");
  const observedAt = document.getElementById("observed-at");

  const allowedViews = new Set([
    "competitions",
    "experiments",
    "benchmarks",
    "capabilities",
    "assets",
  ]);

  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get("view");
  const state = {
    payload: null,
    view: allowedViews.has(requestedView) ? requestedView : "competitions",
    query: params.get("q") || "",
  };

  const text = (value, fallback = "Not reported") => {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const number = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const formatScore = (value) => {
    const numeric = number(value);
    if (numeric === null) return "No public score";
    if (Math.abs(numeric) >= 10) return numeric.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  const formatRate = (value) => {
    const numeric = number(value);
    if (numeric === null) return "Not reported";
    return `${(numeric * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  };

  const create = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  };

  const addChip = (container, value) => {
    if (value === null || value === undefined || value === "") return;
    container.append(create("span", "chip", text(value)));
  };

  const addFact = (container, label, value) => {
    if (value === null || value === undefined || value === "") return;
    const wrapper = create("div", "fact");
    const term = create("dt", "", label);
    const definition = create("dd", "", text(value));
    wrapper.append(term, definition);
    container.append(wrapper);
  };

  const safeLink = (container, label, href) => {
    if (!href) return;
    let parsed;
    try {
      parsed = new URL(href, window.location.origin);
    } catch {
      return;
    }
    if (!["https:", "http:"].includes(parsed.protocol)) return;
    const anchor = create("a", "", label);
    anchor.href = parsed.href;
    if (parsed.origin !== window.location.origin) {
      anchor.target = "_blank";
      anchor.rel = "noopener";
    }
    container.append(anchor);
  };

  const record = ({ title, measure, chips, facts, boundary, links }) => {
    const details = create("details", "record");
    const summary = create("summary");
    const main = create("div", "summary-main");
    const heading = create("h3", "", title);
    const chipRow = create("div", "chips");
    chips.forEach((item) => addChip(chipRow, item));
    main.append(heading, chipRow);
    summary.append(main, create("div", "measure", measure));

    const bodyPanel = create("div", "record-body");
    const factList = create("dl", "facts");
    facts.forEach(([label, value]) => addFact(factList, label, value));
    bodyPanel.append(factList);

    if (boundary) {
      bodyPanel.append(create("p", "boundary", boundary));
    }

    if (links && links.length) {
      const linkRow = create("div", "record-links");
      links.forEach(([label, href]) => safeLink(linkRow, label, href));
      if (linkRow.childElementCount) bodyPanel.append(linkRow);
    }

    details.append(summary, bodyPanel);
    return details;
  };

  const competitionRecord = (item) => {
    const score = item.score || {};
    const rank = item.rank || {};
    const links = Object.entries(item.links || {}).map(([name, href]) => [
      name.charAt(0).toUpperCase() + name.slice(1),
      href,
    ]);
    return record({
      title: text(item.name),
      measure: formatScore(score.value),
      chips: [item.priority, item.track, item.stage, score.evidence],
      facts: [
        ["Metric", item.metric],
        ["Direction", item.direction],
        ["Rank", rank.value],
        ["Teams", item.team_count],
        ["Deadline", item.deadline],
        ["Next controlled action", item.next_action],
      ],
      boundary: score.limitation,
      links,
    });
  };

  const experimentRecord = (item) =>
    record({
      title: text(item.experiment_id),
      measure: item.public_score === null ? "No public score" : formatScore(item.public_score),
      chips: [item.competition_slug, item.decision, item.proof_state, item.evidence],
      facts: [
        ["Metric", item.metric],
        ["Decision", item.decision],
        ["Proof state", item.proof_state],
        ["Evidence", item.evidence],
      ],
      boundary: item.limitations,
      links: [],
    });

  const benchmarkRecord = (item) => {
    const numerator = number(item.numerator);
    const denominator = number(item.denominator);
    const fraction = numerator !== null && denominator !== null
      ? `${numerator}/${denominator}`
      : null;
    return record({
      title: text(item.suite),
      measure: fraction || formatRate(item.value),
      chips: [item.agent_class, item.status, item.evidence, item.publish_decision],
      facts: [
        ["Product", item.product_id],
        ["Metric", item.metric],
        ["Value", formatRate(item.value)],
        ["Observed UTC", item.observed_at_utc],
      ],
      boundary: item.claim_boundary,
      links: [],
    });
  };

  const capabilityRecord = (item) =>
    record({
      title: text(item.capability),
      measure: text(item.source_status),
      chips: [
        item.implementation_class,
        item.category,
        item.evidence,
        item.publish_decision,
      ],
      facts: [
        ["Product", item.product_id],
        ["Evidence summary", item.evidence_summary],
        ["Current host state", item.current_host_state],
        ["Artifact integrity", item.artifact_integrity],
        ["Required proof", item.required_proof],
      ],
      boundary: item.claim_boundary,
      links: [],
    });

  const assetRows = (payload) => {
    const products = payload.products.map((item) => ({ ...item, asset_kind: "product" }));
    const packages = payload.npm_packages.map((item) => ({ ...item, asset_kind: "npm" }));
    const repositories = payload.public_active_original_repositories.map((item) => ({
      ...item,
      asset_kind: "repository",
    }));
    return [...products, ...packages, ...repositories];
  };

  const assetRecord = (item) => {
    if (item.asset_kind === "product") {
      return record({
        title: text(item.name),
        measure: text(item.npm_version, item.publication_state),
        chips: ["product", item.publication_state, item.ownership_evidence],
        facts: [
          ["Role", item.role],
          ["GitHub class", item.github_class],
          ["npm package", item.npm_package],
          ["npm version", item.npm_version],
        ],
        boundary: item.github_visibility === "private"
          ? "Private source remains undisclosed; only the scoped public product record is shown."
          : "",
        links: [
          ["Website", item.website_url],
          ["GitHub", item.github_url],
          ["npm", item.npm_url],
        ],
      });
    }

    if (item.asset_kind === "npm") {
      return record({
        title: text(item.name),
        measure: `v${text(item.version)}`,
        chips: ["npm", item.license, item.ownership_evidence],
        facts: [
          ["Description", item.description],
          ["Publisher", item.publisher_username],
          ["Published", item.published_at],
          ["Keywords", Array.isArray(item.keywords) ? item.keywords.join(", ") : item.keywords],
        ],
        boundary: "Registry metadata proves publication and ownership, not package quality or model capability.",
        links: [
          ["npm", item.npm_url],
          ["Repository", item.repository_url],
          ["Homepage", item.homepage_url],
        ],
      });
    }

    return record({
      title: text(item.name),
      measure: text(item.primary_language, "Repository"),
      chips: ["repository", item.repository_class, item.license, item.ownership_evidence],
      facts: [
        ["Description", item.description],
        ["Stars", item.stars],
        ["Forks", item.fork_count],
        ["Default branch", item.default_branch],
        ["Updated", item.updated_at],
      ],
      boundary: "This list includes public, active, original repositories only. Forks remain references elsewhere.",
      links: [
        ["GitHub", item.url],
        ["Homepage", item.homepage_url],
      ],
    });
  };

  const getRows = () => {
    const payload = state.payload;
    if (state.view === "competitions") {
      return [payload.competitions, competitionRecord];
    }
    if (state.view === "experiments") {
      return [payload.experiments, experimentRecord];
    }
    if (state.view === "benchmarks") {
      return [payload.platform_benchmarks, benchmarkRecord];
    }
    if (state.view === "capabilities") {
      return [payload.capabilities, capabilityRecord];
    }
    return [assetRows(payload), assetRecord];
  };

  const searchText = (item) =>
    JSON.stringify(item)
      .toLocaleLowerCase()
      .replaceAll("_", " ");

  const syncUrl = () => {
    const next = new URL(window.location.href);
    next.searchParams.set("view", state.view);
    if (state.query) next.searchParams.set("q", state.query);
    else next.searchParams.delete("q");
    window.history.replaceState(null, "", next);
  };

  const render = () => {
    if (!state.payload) return;
    const [rows, renderer] = getRows();
    const needle = state.query.trim().toLocaleLowerCase();
    const filtered = needle
      ? rows.filter((item) => searchText(item).includes(needle))
      : rows;

    results.replaceChildren();
    if (!filtered.length) {
      results.append(create("p", "empty", "No governed records match this search."));
    } else {
      const fragment = document.createDocumentFragment();
      filtered.forEach((item) => fragment.append(renderer(item)));
      results.append(fragment);
    }

    count.textContent = `${filtered.length} of ${rows.length} records`;
    tabs.forEach((tab) => {
      const active = tab.dataset.view === state.view;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    syncUrl();
  };

  const renderSummary = (payload) => {
    const ownership = payload.ownership || {};
    const github = ownership.github_counts || {};
    const values = [
      payload.competitions.length,
      ownership.verified_public_npm_packages,
      github.public,
      ownership.capability_records,
    ];
    stats.forEach((element, index) => {
      element.textContent = text(values[index], "0");
    });

    policyList.replaceChildren();
    (payload.publication_policy || []).forEach((item) => {
      policyList.append(create("li", "", text(item)));
    });
    observedAt.textContent = `Evidence observed UTC: ${text(payload.observed_at_utc)}.`;
  };

  const showError = (message) => {
    results.replaceChildren(create("p", "empty", message));
    count.textContent = "Evidence unavailable";
  };

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      render();
    });
  });

  search.value = state.query;
  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });

  fetch(dataUrl, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      state.payload = payload;
      renderSummary(payload);
      render();
    })
    .catch(() => {
      showError("The governed evidence file could not be loaded. The export receipt remains available above.");
    });
})();
