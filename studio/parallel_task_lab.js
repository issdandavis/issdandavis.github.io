(() => {
  "use strict";

  const API = "/v1";
  const state = {
    runs: [],
    selected: null,
    latestInteractionId: null,
    eventSource: null,
    events: [],
  };

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.message || body.error || `HTTP ${response.status}`);
    }
    return body;
  }

  function splitDomains(value) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function selectedTools() {
    return [...document.querySelectorAll("[data-ptl-tool]:checked")].map(
      (input) => input.value,
    );
  }

  function schemaForMode(mode) {
    if (mode === "auto") return null;
    if (mode === "text") return "text";
    return {
      type: "object",
      properties: {
        summary: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              url: { type: "string" },
            },
            required: ["text", "url"],
            additionalProperties: false,
          },
        },
        confidence: { type: "number" },
        source_count: { type: "integer" },
      },
      required: ["summary", "findings", "confidence", "source_count"],
      additionalProperties: false,
    };
  }

  function buildPayload() {
    let evidence;
    try {
      evidence = JSON.parse($("ptl-evidence").value || "[]");
    } catch (error) {
      throw new Error(`Evidence JSON: ${error.message}`);
    }
    const chainPrevious = $("ptl-chain").checked && state.latestInteractionId;
    return {
      objective: $("ptl-objective").value.trim(),
      input: { notes: $("ptl-input").value.trim() },
      processor: $("ptl-processor").value,
      output_schema: schemaForMode($("ptl-schema").value),
      source_policy: {
        include_domains: splitDomains($("ptl-include").value),
        exclude_domains: splitDomains($("ptl-exclude").value),
        freshness_days: $("ptl-freshness").value
          ? Number($("ptl-freshness").value)
          : null,
      },
      evidence,
      allowed_tools: selectedTools(),
      budget: {
        max_seconds: Number($("ptl-seconds").value),
        max_sources: Number($("ptl-sources").value),
        max_output_chars: Number($("ptl-output-chars").value),
      },
      worker:
        $("ptl-worker").value === "remote_ollama"
          ? {
              mode: "remote_ollama",
              endpoint: $("ptl-worker-endpoint").value.trim(),
              model: $("ptl-worker-model").value,
              timeout_seconds: 60,
              max_output_tokens: 256,
            }
          : { mode: "local" },
      previous_interaction_id: chainPrevious || null,
      metadata: { surface: "kimi-v7-parallel-task-lab" },
    };
  }

  function setService(status, label) {
    const element = $("ptl-service");
    element.dataset.state = status;
    element.textContent = label;
  }

  function setFormError(message = "") {
    const element = $("ptl-form-error");
    element.textContent = message;
    element.style.display = message ? "block" : "none";
  }

  function installShell() {
    if ($("ptl-workbench")) return;
    const activityBar = $("actbar");
    const spacer = activityBar?.querySelector(".ai-spacer");
    const side = $("side");
    const editorContent = $("ec");
    if (!activityBar || !side || !editorContent) {
      window.setTimeout(installShell, 100);
      return;
    }

    const icon = document.createElement("div");
    icon.id = "ptl-activity";
    icon.className = "ai";
    icon.dataset.v = "parallel";
    icon.title = "Parallel Task Lab";
    icon.setAttribute("aria-label", "Parallel Task Lab");
    icon.textContent = "⇆";
    activityBar.insertBefore(icon, spacer || null);

    const sideView = document.createElement("div");
    sideView.id = "sv-parallel";
    sideView.className = "sidev";
    sideView.innerHTML = `
      <div class="ptl-side-head">
        <span>Task Runs</span>
        <span>
          <button class="ptl-icon-button" id="ptl-new" title="New task" aria-label="New task">+</button>
          <button class="ptl-icon-button" id="ptl-refresh" title="Refresh runs" aria-label="Refresh runs">↻</button>
        </span>
      </div>
      <div class="ptl-side-list" id="ptl-run-list"></div>
      <div class="ptl-side-footer" id="ptl-side-footer">No runs loaded</div>
    `;
    side.appendChild(sideView);

    const workbench = document.createElement("section");
    workbench.id = "ptl-workbench";
    workbench.setAttribute("aria-label", "Clay Parallel Task Lab");
    workbench.innerHTML = `
      <header class="ptl-topbar">
        <div class="ptl-title">Clay Parallel Task Lab</div>
        <div class="ptl-service" id="ptl-service" data-state="unknown">checking</div>
        <button class="ptl-button" id="ptl-suggest">Ingest spec</button>
        <button class="ptl-button ptl-button-warn" id="ptl-negative-fixture">Langlands check</button>
        <button class="ptl-button" id="ptl-batch">Run 10x</button>
        <button class="ptl-button ptl-button-primary" id="ptl-run">Run task</button>
      </header>
      <div class="ptl-main">
        <form class="ptl-spec" id="ptl-form">
          <div class="ptl-field">
            <label class="ptl-label" for="ptl-objective"><span>Objective</span><code>required</code></label>
            <textarea class="ptl-textarea" id="ptl-objective">Verify the Clay task lifecycle using only admissible, content-hashed evidence.</textarea>
          </div>
          <div class="ptl-field">
            <label class="ptl-label" for="ptl-input"><span>Input</span><code>context</code></label>
            <textarea class="ptl-textarea" id="ptl-input">Compare lifecycle state, evidence basis, and promotion disposition.</textarea>
          </div>
          <div class="ptl-row-3">
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-processor">Processor</label>
              <select class="ptl-select" id="ptl-processor">
                <option value="lite">lite</option>
                <option value="base">base</option>
                <option value="core" selected>core</option>
                <option value="pro">pro</option>
                <option value="ultra">ultra</option>
              </select>
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-schema">Output</label>
              <select class="ptl-select" id="ptl-schema">
                <option value="auto">auto JSON</option>
                <option value="json" selected>strict JSON</option>
                <option value="text">text</option>
              </select>
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-freshness">Freshness days</label>
              <input class="ptl-input" id="ptl-freshness" type="number" min="0" max="3650" placeholder="any">
            </div>
          </div>
          <div class="ptl-row">
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-worker">Worker lane</label>
              <select class="ptl-select" id="ptl-worker">
                <option value="local" selected>local deterministic</option>
                <option value="remote_ollama">desktop Ollama</option>
              </select>
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-worker-model">Remote model</label>
              <select class="ptl-select" id="ptl-worker-model">
                <option value="qwen2.5-coder:3b">qwen2.5-coder:3b</option>
                <option value="qwen3:4b">qwen3:4b</option>
                <option value="llama3.2:1b">llama3.2:1b</option>
              </select>
            </div>
          </div>
          <div class="ptl-field">
            <label class="ptl-label" for="ptl-worker-endpoint"><span>Worker endpoint</span><code>Tailscale</code></label>
            <input class="ptl-input" id="ptl-worker-endpoint" value="http://100.87.197.29:11434">
          </div>
          <div class="ptl-row">
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-include">Include domains</label>
              <input class="ptl-input" id="ptl-include" value="clay.local">
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-exclude">Exclude domains</label>
              <input class="ptl-input" id="ptl-exclude" value="noise.example">
            </div>
          </div>
          <div class="ptl-field">
            <label class="ptl-label" for="ptl-evidence"><span>Evidence</span><code>JSON array</code></label>
            <textarea class="ptl-textarea ptl-code" id="ptl-evidence" spellcheck="false">[
  {
    "title": "Clay sealed task contract",
    "url": "https://clay.local/task-contract",
    "updated_at": "2026-07-24T00:00:00Z",
    "text": "Clay task runs preserve queued, running, and completed states. Every selected source carries a content hash and an audit seal."
  },
  {
    "title": "Excluded source",
    "url": "https://noise.example/untrusted",
    "updated_at": "2026-07-24T00:00:00Z",
    "text": "This source must be rejected by policy."
  }
]</textarea>
          </div>
          <div class="ptl-field">
            <div class="ptl-label">Allowed tools</div>
            <div class="ptl-checks">
              <label class="ptl-check"><input data-ptl-tool type="checkbox" value="source.search" checked> source.search</label>
              <label class="ptl-check"><input data-ptl-tool type="checkbox" value="source.quote" checked> source.quote</label>
              <label class="ptl-check"><input data-ptl-tool type="checkbox" value="schema.validate" checked> schema.validate</label>
              <label class="ptl-check"><input data-ptl-tool type="checkbox" value="worker.infer" checked> worker.infer</label>
            </div>
          </div>
          <div class="ptl-row-3">
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-seconds">Seconds</label>
              <input class="ptl-input" id="ptl-seconds" type="number" min="0.1" max="300" step="0.1" value="20">
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-sources">Sources</label>
              <input class="ptl-input" id="ptl-sources" type="number" min="1" max="100" value="8">
            </div>
            <div class="ptl-field">
              <label class="ptl-label" for="ptl-output-chars">Output chars</label>
              <input class="ptl-input" id="ptl-output-chars" type="number" min="100" max="100000" value="12000">
            </div>
          </div>
          <div class="ptl-checks">
            <label class="ptl-check"><input id="ptl-chain" type="checkbox"> chain previous interaction</label>
          </div>
          <div id="ptl-form-error" style="display:none;margin-top:10px;color:#ef9b94;font:11px/1.45 var(--mono)"></div>
        </form>
        <section class="ptl-output">
          <div class="ptl-run-head">
            <div class="ptl-run-id" id="ptl-run-id">No task selected</div>
            <div class="ptl-status" id="ptl-status" data-state="idle">idle</div>
          </div>
          <div class="ptl-disposition" id="ptl-disposition"></div>
          <div style="display:grid;grid-template-rows:33px minmax(0,1fr);min-height:0">
            <nav class="ptl-tabs" aria-label="Task output views">
              <button class="ptl-tab ptl-active" type="button" data-ptl-tab="result">Result</button>
              <button class="ptl-tab" type="button" data-ptl-tab="basis">Basis</button>
              <button class="ptl-tab" type="button" data-ptl-tab="events">Events</button>
            </nav>
            <div style="position:relative;min-height:0">
              <div class="ptl-tabpanel ptl-active" id="ptl-panel-result"><div class="ptl-empty">Run a task to inspect its exact output.</div></div>
              <div class="ptl-tabpanel" id="ptl-panel-basis"><div class="ptl-empty">No field basis available.</div></div>
              <div class="ptl-tabpanel" id="ptl-panel-events"><div class="ptl-empty">No lifecycle events available.</div></div>
            </div>
          </div>
        </section>
      </div>
    `;
    editorContent.appendChild(workbench);
    bindEvents();
    checkHealth();
    refreshRuns();
    window.ClayTaskLab = {
      show: showLab,
      hide: hideLab,
      refresh: refreshRuns,
    };
  }

  function showLab() {
    document.querySelectorAll("#actbar .ai").forEach((item) => item.classList.remove("on"));
    $("ptl-activity")?.classList.add("on");
    document.querySelectorAll("#side .sidev").forEach((item) => item.classList.remove("on"));
    $("sv-parallel")?.classList.add("on");
    $("ptl-workbench")?.classList.add("ptl-on");
  }

  function hideLab() {
    $("ptl-workbench")?.classList.remove("ptl-on");
  }

  function bindEvents() {
    $("ptl-activity").addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      showLab();
    });
    $("actbar").addEventListener(
      "click",
      (event) => {
        const item = event.target.closest(".ai");
        if (item && item.id !== "ptl-activity") hideLab();
      },
      true,
    );
    $("ptl-run").addEventListener("click", runTask);
    $("ptl-batch").addEventListener("click", runBatch);
    $("ptl-suggest").addEventListener("click", suggestSpec);
    $("ptl-negative-fixture").addEventListener("click", loadNegativeFixture);
    $("ptl-refresh").addEventListener("click", refreshRuns);
    $("ptl-new").addEventListener("click", () => {
      state.selected = null;
      state.events = [];
      renderRun(null);
      showLab();
      $("ptl-objective").focus();
    });
    document.querySelectorAll("[data-ptl-tab]").forEach((button) => {
      button.addEventListener("click", () => selectTab(button.dataset.ptlTab));
    });
    $("ptl-form").addEventListener("submit", (event) => {
      event.preventDefault();
      runTask();
    });
  }

  function selectTab(name) {
    document.querySelectorAll("[data-ptl-tab]").forEach((button) => {
      button.classList.toggle("ptl-active", button.dataset.ptlTab === name);
    });
    ["result", "basis", "events"].forEach((panel) => {
      $(`ptl-panel-${panel}`).classList.toggle("ptl-active", panel === name);
    });
  }

  async function checkHealth() {
    try {
      const health = await api("/health");
      setService("online", health.status);
    } catch (_error) {
      setService("offline", "offline");
    }
  }

  async function suggestSpec() {
    setFormError();
    try {
      const suggestion = await api("/tasks/ingest", {
        method: "POST",
        body: JSON.stringify({ objective: $("ptl-objective").value }),
      });
      $("ptl-processor").value = suggestion.processor;
      $("ptl-schema").value = "json";
      setService("online", `spec ${suggestion.processor}`);
    } catch (error) {
      setFormError(error.message);
    }
  }

  function loadNegativeFixture() {
    $("ptl-objective").value =
      "Verify the positive-sounding claim that Logos Field Theory proves a Langlands boundary between P and NP.";
    $("ptl-input").value =
      "Fail closed unless an admissible mathematical source supports the claim.";
    $("ptl-include").value = "trusted.math";
    $("ptl-exclude").value = "video.local";
    $("ptl-evidence").value = JSON.stringify(
      [
        {
          title: "AI-generated Adelic Universe transcript",
          url: "https://video.local/adelic-universe",
          updated_at: "2026-07-20T00:00:00Z",
          text:
            "Logos Field Theory maps the critical line to black hole formation and the scaling wall between P and NP.",
        },
      ],
      null,
      2,
    );
    $("ptl-schema").value = "auto";
    setFormError();
  }

  async function runTask() {
    setFormError();
    let payload;
    try {
      payload = buildPayload();
      if (!payload.objective) throw new Error("Objective is required.");
      const run = await api("/tasks/runs", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.selected = run.run_id;
      state.latestInteractionId = run.interaction_id;
      state.events = [];
      renderRun(run);
      connectEvents(run.run_id);
      await refreshRuns();
    } catch (error) {
      setFormError(error.message);
    }
  }

  async function runBatch() {
    setFormError();
    try {
      const payload = buildPayload();
      const group = await api("/tasks/groups", {
        method: "POST",
        body: JSON.stringify({
          tasks: Array.from({ length: 10 }, (_, index) => ({
            ...payload,
            input: { ...payload.input, batch_index: index },
            previous_interaction_id: null,
          })),
          metadata: { surface: "kimi-v7-parallel-task-lab", repetitions: 10 },
        }),
      });
      setService("online", `group ${group.status}`);
      state.selected = group.run_ids[0];
      await refreshRuns();
      await loadRun(state.selected);
    } catch (error) {
      setFormError(error.message);
    }
  }

  function connectEvents(runId) {
    state.eventSource?.close();
    const stream = new EventSource(`${API}/tasks/runs/${runId}/events`);
    state.eventSource = stream;
    const eventNames = [
      "task.queued",
      "task.running",
      "tool.started",
      "tool.completed",
      "task.completed",
      "task.failed",
      "task.cancelled",
      "webhook.delivery",
    ];
    eventNames.forEach((name) => {
      stream.addEventListener(name, async (message) => {
        const event = JSON.parse(message.data);
        state.events.push(event);
        renderEvents();
        if (["task.completed", "task.failed", "task.cancelled"].includes(name)) {
          stream.close();
          await loadRun(runId);
          await refreshRuns();
        }
      });
    });
  }

  async function refreshRuns() {
    try {
      const body = await api("/tasks/runs?limit=100");
      state.runs = body.runs;
      renderRunList();
      setService("online", `${state.runs.length} runs`);
    } catch (error) {
      setService("offline", "offline");
      setFormError(error.message);
    }
  }

  function renderRunList() {
    const list = $("ptl-run-list");
    if (!state.runs.length) {
      list.innerHTML = '<div class="ptl-empty" style="padding-top:40px">No runs</div>';
      $("ptl-side-footer").textContent = "0 runs";
      return;
    }
    list.innerHTML = state.runs
      .map(
        (run) => `
          <button class="ptl-side-run ${run.run_id === state.selected ? "ptl-selected" : ""}" data-run-id="${escapeHtml(run.run_id)}">
            <b>${escapeHtml(run.task.objective)}</b>
            <small>
              <span class="ptl-side-state" data-state="${escapeHtml(run.status)}">${escapeHtml(run.status)}</span>
              <span>${escapeHtml(run.task.processor)}</span>
            </small>
          </button>
        `,
      )
      .join("");
    list.querySelectorAll("[data-run-id]").forEach((button) => {
      button.addEventListener("click", () => loadRun(button.dataset.runId));
    });
    const negative = state.runs.filter((run) => run.disposition?.negative_example).length;
    $("ptl-side-footer").textContent = `${state.runs.length} runs · ${negative} negative`;
  }

  async function loadRun(runId) {
    try {
      const run = await api(`/tasks/runs/${runId}`);
      state.selected = runId;
      state.latestInteractionId = run.interaction_id;
      state.events = await apiEvents(runId);
      renderRun(run);
      renderRunList();
      showLab();
    } catch (error) {
      setFormError(error.message);
    }
  }

  async function apiEvents(runId) {
    try {
      const response = await fetch(`${API}/tasks/runs/${runId}/events?after=0`);
      const text = await response.text();
      return text
        .split("\n\n")
        .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
        .filter(Boolean)
        .map((line) => JSON.parse(line.slice(6)));
    } catch (_error) {
      return [];
    }
  }

  function renderRun(run) {
    if (!run) {
      $("ptl-run-id").textContent = "No task selected";
      $("ptl-status").textContent = "idle";
      $("ptl-status").dataset.state = "idle";
      $("ptl-disposition").classList.remove("ptl-show");
      $("ptl-panel-result").innerHTML =
        '<div class="ptl-empty">Run a task to inspect its exact output.</div>';
      $("ptl-panel-basis").innerHTML =
        '<div class="ptl-empty">No field basis available.</div>';
      $("ptl-panel-events").innerHTML =
        '<div class="ptl-empty">No lifecycle events available.</div>';
      return;
    }
    $("ptl-run-id").textContent = `${run.run_id} · ${run.interaction_id}`;
    $("ptl-status").textContent = run.status;
    $("ptl-status").dataset.state = run.status;
    const disposition = $("ptl-disposition");
    if (run.disposition && run.disposition.status !== "pending") {
      disposition.classList.add("ptl-show");
      disposition.dataset.state = run.disposition.status;
      disposition.textContent = `${run.disposition.status}: ${run.disposition.reason}`;
    } else {
      disposition.classList.remove("ptl-show");
    }
    $("ptl-panel-result").innerHTML =
      run.result !== null
        ? `<pre class="ptl-pre">${escapeHtml(JSON.stringify(run.result, null, 2))}</pre>
           <pre class="ptl-pre" style="margin-top:14px;color:#7f8792">${escapeHtml(
             JSON.stringify(
               {
                 input_sha256: run.input_sha256,
                 output_sha256: run.output_sha256,
                 metrics: run.metrics,
                 completion_seal: run.completion_seal,
               },
               null,
               2,
             ),
           )}</pre>`
        : `<div class="ptl-empty">${escapeHtml(run.error?.message || "Task is running.")}</div>`;
    renderBasis(run.basis || []);
    renderEvents();
  }

  function renderBasis(basis) {
    const panel = $("ptl-panel-basis");
    if (!basis.length) {
      panel.innerHTML = '<div class="ptl-empty">No field basis available.</div>';
      return;
    }
    panel.innerHTML = basis
      .map(
        (item) => `
          <div class="ptl-basis-row">
            <div class="ptl-basis-field">${escapeHtml(item.field)}</div>
            <div class="ptl-basis-meta">confidence ${escapeHtml(item.confidence)} · ${escapeHtml(item.reasoning)}</div>
            ${(item.citations || [])
              .map(
                (citation) => `
                  <a class="ptl-citation" href="${escapeHtml(citation.url)}" target="_blank" rel="noreferrer">
                    ${escapeHtml(citation.title)} · ${escapeHtml(citation.content_sha256)}
                  </a>
                `,
              )
              .join("")}
          </div>
        `,
      )
      .join("");
  }

  function renderEvents() {
    const panel = $("ptl-panel-events");
    if (!state.events.length) {
      panel.innerHTML = '<div class="ptl-empty">No lifecycle events available.</div>';
      return;
    }
    panel.innerHTML = state.events
      .map(
        (event) => `
          <div class="ptl-event">
            <div class="ptl-event-cursor">#${escapeHtml(event.cursor)}</div>
            <div class="ptl-event-type">${escapeHtml(event.type)}</div>
            <div class="ptl-event-data">${escapeHtml(JSON.stringify(event.data))}</div>
          </div>
        `,
      )
      .join("");
  }

  async function boot() {
    try {
      const response = await fetch(`${API}/session`, {
        credentials: "same-origin",
      });
      const session = response.ok ? await response.json() : null;
      if (!session?.features?.task_lab) return;
      installShell();
    } catch (_error) {
      return;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      window.setTimeout(boot, 250),
    );
  } else {
    window.setTimeout(boot, 250);
  }
})();
