/**
 * AetherMoore Backroom — ops floor probes + map rendering
 * Loads static/backroom-map.json and paints architecture / schema / stations / monitors.
 */
(function () {
  "use strict";

  const MAP_URL = "/static/backroom-map.json";
  const state = {
    map: null,
    selected: null,
    probeResults: {},
  };

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "className") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "html") node.innerHTML = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null) node.setAttribute(k, v);
      });
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function visibilityClass(v) {
    if (v === "public") return "vis-public";
    if (v === "mixed") return "vis-mixed";
    return "vis-operator";
  }

  function kindIcon(kind) {
    const map = {
      worker: "⚡",
      hosting: "🌐",
      tunnel: "🚇",
      desktop: "🖥️",
      browser: "🧭",
      governance: "🔏",
      framework: "🧬",
      runtime: "🧠",
      database: "🗄️",
      audit: "📋",
      dataset: "📦",
    };
    return map[kind] || "◆";
  }

  function selectNode(node) {
    state.selected = node;
    const panel = $("#detail-panel");
    if (!panel || !node) return;
    panel.innerHTML = "";
    panel.appendChild(el("div", { className: "detail-kicker", text: (node.kind || "node") + " · " + (node.visibility || "operator") }));
    panel.appendChild(el("h3", { text: node.name }));
    panel.appendChild(el("p", { className: "detail-role", text: node.role || "" }));

    const meta = el("dl", { className: "detail-meta" });
    const rows = [
      ["Stack", (node.stack || []).join(" · ")],
      ["Public URL", node.url],
      ["Hostname", node.hostname],
      ["Origin", node.origin],
      ["Local", node.local],
      ["APIs", (node.apis || []).join(" · ")],
    ];
    rows.forEach(([k, v]) => {
      if (!v) return;
      meta.appendChild(el("dt", { text: k }));
      if (String(v).startsWith("http")) {
        const dd = el("dd");
        dd.appendChild(el("a", { href: v, target: "_blank", rel: "noopener", text: v }));
        meta.appendChild(dd);
      } else {
        meta.appendChild(el("dd", { text: String(v) }));
      }
    });
    panel.appendChild(meta);

    document.querySelectorAll(".station-card, .arch-node").forEach((n) => {
      n.classList.toggle("is-selected", n.getAttribute("data-id") === node.id);
    });
  }

  function renderArchitecture(map) {
    const host = $("#arch-canvas");
    if (!host) return;
    host.innerHTML = "";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 1000 420");
    svg.setAttribute("class", "arch-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "System architecture flow from public edge to operator stations");

    // Background lanes
    const lanes = [
      { y: 40, label: "EDGE", color: "rgba(109,216,255,0.12)" },
      { y: 150, label: "TUNNELS", color: "rgba(255,217,119,0.10)" },
      { y: 260, label: "STATIONS", color: "rgba(143,255,211,0.10)" },
      { y: 360, label: "DATA", color: "rgba(196,156,255,0.10)" },
    ];
    lanes.forEach((lane) => {
      const r = document.createElementNS(svgNS, "rect");
      r.setAttribute("x", "20");
      r.setAttribute("y", String(lane.y - 28));
      r.setAttribute("width", "960");
      r.setAttribute("height", "72");
      r.setAttribute("rx", "14");
      r.setAttribute("fill", lane.color);
      r.setAttribute("stroke", "rgba(139,255,223,0.12)");
      svg.appendChild(r);
      const t = document.createElementNS(svgNS, "text");
      t.setAttribute("x", "36");
      t.setAttribute("y", String(lane.y - 8));
      t.setAttribute("fill", "rgba(155,197,186,0.85)");
      t.setAttribute("font-size", "11");
      t.setAttribute("font-family", "ui-monospace, monospace");
      t.setAttribute("letter-spacing", "0.16em");
      t.textContent = lane.label;
      svg.appendChild(t);
    });

    // Flow lines (edge → tunnels → stations → data)
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M 120 70 C 200 70, 220 150, 300 150 S 480 150, 520 260 S 700 260, 740 360");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "rgba(143,255,211,0.35)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-dasharray", "6 6");
    path.classList.add("flow-pulse");
    svg.appendChild(path);

    const layerY = { edge: 52, tunnels: 162, stations: 272, data: 372 };
    map.layers.forEach((layer) => {
      const y = layerY[layer.id] || 200;
      const nodes = layer.nodes || [];
      const startX = 160;
      const gap = Math.min(140, 780 / Math.max(nodes.length, 1));
      nodes.forEach((node, i) => {
        const x = startX + i * gap;
        const g = document.createElementNS(svgNS, "g");
        g.setAttribute("class", "arch-node " + visibilityClass(node.visibility));
        g.setAttribute("data-id", node.id);
        g.style.cursor = "pointer";
        g.addEventListener("click", () => selectNode(node));

        const box = document.createElementNS(svgNS, "rect");
        box.setAttribute("x", String(x));
        box.setAttribute("y", String(y));
        box.setAttribute("width", "118");
        box.setAttribute("height", "44");
        box.setAttribute("rx", "10");
        box.setAttribute("class", "arch-node-box");
        g.appendChild(box);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", String(x + 59));
        label.setAttribute("y", String(y + 26));
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("class", "arch-node-label");
        label.textContent = node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name;
        g.appendChild(label);

        svg.appendChild(g);
      });
    });

    host.appendChild(svg);
  }

  function renderStations(map) {
    const host = $("#station-grid");
    if (!host) return;
    host.innerHTML = "";
    map.layers.forEach((layer) => {
      (layer.nodes || []).forEach((node) => {
        const card = el("button", {
          type: "button",
          className: "station-card " + visibilityClass(node.visibility),
          "data-id": node.id,
          onclick: () => selectNode(node),
        });
        card.appendChild(el("div", { className: "station-icon", text: kindIcon(node.kind) }));
        card.appendChild(el("div", { className: "station-body" }, [
          el("div", { className: "station-layer", text: layer.label }),
          el("h3", { text: node.name }),
          el("p", { text: node.role || "" }),
          el("div", { className: "station-tags" }, [
            el("span", { className: "tag", text: node.kind || "node" }),
            el("span", { className: "tag " + visibilityClass(node.visibility), text: node.visibility || "operator" }),
          ]),
        ]));
        host.appendChild(card);
      });
    });
  }

  function renderSchema(map) {
    const host = $("#schema-board");
    if (!host) return;
    host.innerHTML = "";
    (map.schema_entities || []).forEach((ent) => {
      const card = el("div", { className: "schema-card" });
      card.appendChild(el("h4", { text: ent.entity }));
      card.appendChild(el("ul", {}, (ent.fields || []).map((f) => el("li", { text: f }))));
      card.appendChild(el("div", { className: "schema-store", text: "→ " + (ent.stores || []).join(", ") }));
      host.appendChild(card);
    });

    const rel = $("#schema-relations");
    if (rel) {
      rel.innerHTML = "";
      (map.relations || []).forEach((r) => {
        rel.appendChild(
          el("div", { className: "rel-row", text: r.from + "  " + r.card + "  " + r.to })
        );
      });
    }
  }

  function renderFlows(map) {
    const host = $("#flow-list");
    if (!host) return;
    host.innerHTML = "";
    (map.flows || []).forEach((flow) => {
      const row = el("div", { className: "flow-row" });
      row.appendChild(el("div", { className: "flow-label", text: flow.label }));
      const steps = el("div", { className: "flow-steps" });
      (flow.steps || []).forEach((s, i) => {
        if (i) steps.appendChild(el("span", { className: "flow-arrow", text: "→" }));
        steps.appendChild(el("span", { className: "flow-step", text: s }));
      });
      row.appendChild(steps);
      host.appendChild(row);
    });
  }

  async function probeUrl(url) {
    const started = performance.now();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const ms = Math.round(performance.now() - started);
      let snippet = "";
      try {
        const text = await res.text();
        snippet = text.slice(0, 120).replace(/\s+/g, " ");
      } catch (_) {
        /* ignore */
      }
      return { ok: res.ok, status: res.status, ms, snippet };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      return { ok: false, status: 0, ms, error: String(err && err.message ? err.message : err) };
    }
  }

  function paintProbeRow(container, probe, result) {
    const row = el("div", { className: "probe-row " + (result.ok ? "probe-ok" : "probe-bad") });
    row.appendChild(el("div", { className: "probe-dot", text: result.ok ? "●" : "○" }));
    row.appendChild(el("div", { className: "probe-label", text: probe.label }));
    row.appendChild(
      el("div", {
        className: "probe-status",
        text: result.ok ? "HTTP " + result.status + " · " + result.ms + "ms" : result.error || "fail · " + result.ms + "ms",
      })
    );
    if (result.snippet) {
      row.appendChild(el("div", { className: "probe-snip", text: result.snippet }));
    }
    container.appendChild(row);
  }

  async function runPublicProbes(map) {
    const host = $("#probe-public");
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(el("div", { className: "probe-loading", text: "Probing public edge…" }));
    const probes = map.public_probes || [];
    const results = await Promise.all(
      probes.map(async (p) => {
        const r = await probeUrl(p.url);
        state.probeResults[p.id] = r;
        return { p, r };
      })
    );
    host.innerHTML = "";
    results.forEach(({ p, r }) => paintProbeRow(host, p, r));
    updateMonitorStrip(map);
  }

  async function runLocalProbes(map) {
    const host = $("#probe-local");
    const note = $("#probe-local-note");
    if (note) note.textContent = map.local_probes_note || "";
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(el("div", { className: "probe-loading", text: "Probing local stations (only works on operator machine)…" }));
    const probes = map.local_probes || [];
    const results = await Promise.all(
      probes.map(async (p) => {
        const r = await probeUrl(p.url);
        state.probeResults[p.id] = r;
        return { p, r };
      })
    );
    host.innerHTML = "";
    results.forEach(({ p, r }) => paintProbeRow(host, p, r));
    updateMonitorStrip(map);
  }

  function updateMonitorStrip(map) {
    const strip = $("#monitor-strip");
    if (!strip) return;
    const publicProbes = map.public_probes || [];
    const ok = publicProbes.filter((p) => state.probeResults[p.id] && state.probeResults[p.id].ok).length;
    const total = publicProbes.length;
    const avg =
      publicProbes
        .map((p) => state.probeResults[p.id])
        .filter(Boolean)
        .reduce((a, r) => a + (r.ms || 0), 0) / Math.max(total, 1);

    $("#mon-edge-count") && ($("#mon-edge-count").textContent = ok + " / " + total);
    $("#mon-edge-latency") && ($("#mon-edge-latency").textContent = Math.round(avg) + " ms");
    $("#mon-layers") && ($("#mon-layers").textContent = String((map.layers || []).length));
    $("#mon-nodes") &&
      ($("#mon-nodes").textContent = String(
        (map.layers || []).reduce((n, l) => n + (l.nodes || []).length, 0)
      ));
    $("#mon-updated") && ($("#mon-updated").textContent = new Date().toLocaleTimeString());
  }

  function wireTabs() {
    document.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-tab");
        document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("is-active", b === btn));
        document.querySelectorAll("[data-panel]").forEach((p) => {
          p.classList.toggle("is-active", p.getAttribute("data-panel") === id);
        });
      });
    });
  }

  async function init() {
    wireTabs();
    const refreshPub = $("#btn-probe-public");
    const refreshLoc = $("#btn-probe-local");
    if (refreshPub) refreshPub.addEventListener("click", () => state.map && runPublicProbes(state.map));
    if (refreshLoc) refreshLoc.addEventListener("click", () => state.map && runLocalProbes(state.map));

    try {
      const res = await fetch(MAP_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("map HTTP " + res.status);
      state.map = await res.json();
    } catch (err) {
      const fail = $("#map-load-error");
      if (fail) fail.textContent = "Failed to load backroom map: " + err.message;
      return;
    }

    $("#map-version") && ($("#map-version").textContent = state.map.version || "");
    renderArchitecture(state.map);
    renderStations(state.map);
    renderSchema(state.map);
    renderFlows(state.map);

    // Default select AetherDesk
    const desk = (state.map.layers || [])
      .flatMap((l) => l.nodes || [])
      .find((n) => n.id === "aetherdesk");
    if (desk) selectNode(desk);

    await runPublicProbes(state.map);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
