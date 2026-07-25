(() => {
  "use strict";

  const API = "/v1";
  const fallbackSession = {
    schema: "clay.studio-session.v1",
    service: "clay-studio",
    mode: "public-static",
    features: {
      browser_workspace: true,
      javascript_worker: true,
      html_preview: true,
      task_lab: false,
      media_editor: true,
      youtube_embed: true,
      youtube_transcript_fetch: false,
      clay_chat: false,
      clay_cli: false,
      claude_cli: false,
      geoseal_cli: false,
      host_shell: false,
      aether_browser: false,
      ai_bridge: false,
      ai_bridge_send: false,
    },
    boundary: "Static mode exposes browser-local editing and media tools only.",
  };

  const state = {
    session: fallbackSession,
    manifest: null,
    lastToolResult: null,
    cues: [],
    selectedCue: -1,
    mediaTitle: "transcript",
    videoId: "",
    localMediaUrl: "",
    bridge: {
      status: null,
      allRecords: [],
      records: [],
      peer: "",
      selectedId: "",
      timer: null,
      loading: false,
    },
  };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  async function api(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_error) {
      throw new Error(`Clay Studio returned HTTP ${response.status}.`);
    }
    if (!response.ok) {
      throw new Error(body.message || body.error || `HTTP ${response.status}`);
    }
    return body;
  }

  async function loadSession() {
    try {
      state.session = await api("/session");
    } catch (_error) {
      state.session = fallbackSession;
    }
    return state.session;
  }

  function waitForApp() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        if (window._app && byId("actbar") && byId("ec")) {
          window.clearInterval(timer);
          resolve(window._app);
        } else if (attempts > 200) {
          window.clearInterval(timer);
          reject(new Error("Kimi shell did not finish booting."));
        }
      }, 50);
    });
  }

  function toast(message, type = "info") {
    const host = byId("toast");
    if (!host) return;
    const item = document.createElement("div");
    item.className = `toast ${type === "success" ? "ok" : type === "error" ? "err" : type}`;
    item.textContent = message;
    host.appendChild(item);
    window.setTimeout(() => item.remove(), 3200);
  }

  function setBrand() {
    document.title = "Clay Studio | Kimi v7";
    const logo = document.querySelector("#titlebar .tb-logo");
    if (logo) {
      const textNode = [...logo.childNodes].find(
        (node) => node.nodeType === Node.TEXT_NODE,
      );
      if (textNode) textNode.nodeValue = " Clay Studio";
    }
    const heading = document.querySelector("#wel h1");
    if (heading) heading.innerHTML = "<b>Clay</b> Studio";
    const subtitle = document.querySelector("#wel > p");
    if (subtitle) {
      subtitle.textContent =
        state.session.mode === "owner"
          ? "Owner workspace"
          : "Browser workspace";
    }
  }

  function hideStudioSurfaces() {
    stopBridgePolling();
    document
      .querySelectorAll(".studio-workbench")
      .forEach((element) => element.classList.remove("studio-on"));
    byId("ptl-workbench")?.classList.remove("ptl-on");
    byId("aipanel")?.classList.remove("on");
  }

  function showSurface(workbenchId, sideId, iconId) {
    hideStudioSurfaces();
    byId("side")?.classList.remove("studio-mobile-side-open");
    document
      .querySelectorAll("#actbar .ai")
      .forEach((element) => element.classList.remove("on"));
    document
      .querySelectorAll("#side .sidev")
      .forEach((element) => element.classList.remove("on"));
    byId(workbenchId)?.classList.add("studio-on");
    byId(sideId)?.classList.add("on");
    byId(iconId)?.classList.add("on");
  }

  function installActivityIcon({ id, title, text, beforeSpacer = true }) {
    const activityBar = byId("actbar");
    const icon = document.createElement("div");
    icon.id = id;
    icon.className = "ai";
    icon.title = title;
    icon.setAttribute("aria-label", title);
    icon.textContent = text;
    const spacer = activityBar.querySelector(".ai-spacer");
    activityBar.insertBefore(icon, beforeSpacer ? spacer : null);
    return icon;
  }

  function replaceActivityIcon(selector, { id, title, text }) {
    const original = document.querySelector(selector);
    if (!original) return installActivityIcon({ id, title, text });
    const icon = original.cloneNode(false);
    icon.id = id;
    icon.className = original.className;
    icon.dataset.v = "";
    icon.title = title;
    icon.setAttribute("aria-label", title);
    icon.textContent = text;
    original.replaceWith(icon);
    return icon;
  }

  function installRuntimeSidebar() {
    if (byId("sv-studio-runtime")) return;
    const view = document.createElement("div");
    view.id = "sv-studio-runtime";
    view.className = "sidev";
    view.innerHTML = `
      <div class="studio-side-head">
        <span>Clay Runtime</span>
        <button class="studio-icon-button" id="studio-runtime-refresh" title="Refresh runtime" aria-label="Refresh runtime">↻</button>
      </div>
      <div class="studio-side-body">
        <div id="studio-runtime-banner"></div>
        <div class="studio-side-section">
          <div class="studio-side-label">Actions</div>
          <button class="studio-side-row" id="studio-open-chat">
            <b>Open Clay chat</b><small>single local model · tool harness</small>
          </button>
          <button class="studio-side-row" id="studio-open-tools">
            <b>Open tool bus</b><small>GeoSeal lanes and receipts</small>
          </button>
          <button class="studio-side-row" id="studio-open-tasks">
            <b>Open task lab</b><small>local or remote worker lane</small>
          </button>
          <button class="studio-side-row" id="studio-open-bridge">
            <b>Open AI channels</b><small>sealed cross-PC inbox and replies</small>
          </button>
        </div>
      </div>
    `;
    byId("side").appendChild(view);
    byId("studio-runtime-refresh").addEventListener("click", refreshRuntime);
    byId("studio-open-chat").addEventListener("click", openClayChat);
    byId("studio-open-tools").addEventListener("click", () =>
      showSurface("studio-tools-workbench", "sv-studio-tools", "studio-tools-activity"),
    );
    byId("studio-open-tasks").addEventListener("click", () => {
      byId("ptl-activity")?.click();
    });
    byId("studio-open-bridge").addEventListener("click", () => {
      showBridgeChannels();
    });
  }

  function renderRuntime() {
    const features = state.session.features || {};
    const rows = [
      ["Mode", state.session.mode],
      ["Clay", features.clay_chat ? "ready" : "browser-only"],
      ["GeoSeal", features.geoseal_cli ? "ready" : "unavailable"],
      ["Remote lane", features.task_lab ? "registered" : "static"],
      ["Bridge", features.ai_bridge ? "receiving" : "unavailable"],
    ];
    byId("studio-runtime-banner").innerHTML = `
      <div class="studio-status" data-state="${features.clay_chat ? "ready" : "offline"}">
        ${escapeHtml(state.session.service)}
      </div>
      <div class="studio-side-runtime">
        ${rows
          .map(
            ([label, value]) =>
              `<div class="studio-runtime-line"><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`,
          )
          .join("")}
      </div>
    `;
    byId("studio-open-tasks").hidden = !features.task_lab;
    byId("studio-open-bridge").hidden = !features.ai_bridge;
    const indicator = byId("aiind");
    indicator?.classList.toggle("on", Boolean(features.clay_chat));
  }

  async function refreshRuntime() {
    await loadSession();
    renderRuntime();
    if (state.session.features.geoseal_cli) await loadHarnessManifest();
    toast("Runtime refreshed", "success");
  }

  function openClayChat() {
    hideStudioSurfaces();
    byId("side")?.classList.remove("studio-mobile-side-open");
    document
      .querySelectorAll("#actbar .ai")
      .forEach((element) => element.classList.remove("on"));
    document
      .querySelectorAll("#side .sidev")
      .forEach((element) => element.classList.remove("on"));
    byId("studio-clay-activity")?.classList.add("on");
    byId("sv-studio-runtime")?.classList.add("on");
    byId("aipanel")?.classList.add("on");
    byId("aiin")?.focus();
  }

  function appendChat(role, text, meta = "") {
    const message = document.createElement("div");
    message.className = `aimsg ${role}`;
    message.textContent = text;
    if (meta) {
      const detail = document.createElement("span");
      detail.className = "studio-message-meta";
      detail.textContent = meta;
      message.appendChild(detail);
    }
    byId("aichat").appendChild(message);
    byId("aichat").scrollTop = byId("aichat").scrollHeight;
    return message;
  }

  async function sendClayMessage() {
    const input = byId("aiin");
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = "";
    appendChat("u", prompt);
    if (!state.session.features.clay_chat) {
      appendChat(
        "sys",
        "Clay chat is available only from the loopback owner runtime. This public workspace does not fake a reply.",
      );
      return;
    }
    const pending = appendChat("sys", "Clay is working through the local harness...");
    byId("aisend").disabled = true;
    try {
      const app = window._app;
      const response = await api("/clay/chat", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          active_file: app.af || "",
          content: app.af && app.editor ? app.editor.getValue() : "",
        }),
      });
      pending.remove();
      appendChat(
        "a",
        response.answer || "(No answer returned.)",
        `${response.model || "clay"} · ${(response.tools_used || []).join(", ") || "no tools"}`,
      );
    } catch (error) {
      pending.remove();
      appendChat("sys", `Clay harness error: ${error.message}`);
    } finally {
      byId("aisend").disabled = false;
      input.focus();
    }
  }

  function wireClayChat() {
    const header = document.querySelector("#aipanel .aih h3");
    if (header) {
      header.innerHTML = `Clay <span class="status" id="aiind"></span>`;
    }
    byId("aiin").placeholder = "Ask Clay...";
    byId("aisend").addEventListener("click", sendClayMessage);
    byId("aiin").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendClayMessage();
      }
    });
    byId("aicl").addEventListener("click", () =>
      byId("aipanel").classList.remove("on"),
    );
    if (!byId("aichat").children.length) {
      appendChat(
        "sys",
        state.session.features.clay_chat
          ? "Connected to Clay through the local tool harness."
          : "Browser workspace ready. Start the owner runtime for local Clay chat.",
      );
    }
  }

  function installBridge() {
    if (!state.session.features.ai_bridge || byId("studio-bridge-workbench")) {
      return;
    }

    const side = document.createElement("div");
    side.id = "sv-studio-bridge";
    side.className = "sidev";
    side.innerHTML = `
      <div class="studio-side-head">
        <span>AI Channels</span>
        <button class="studio-icon-button" id="studio-bridge-side-refresh" title="Refresh channels" aria-label="Refresh channels">↻</button>
      </div>
      <div class="studio-side-body">
        <div id="studio-bridge-side-status"></div>
        <div class="studio-side-section">
          <div class="studio-side-label">Peers</div>
          <div id="studio-bridge-peers"></div>
        </div>
      </div>
    `;
    byId("side").appendChild(side);

    const workbench = document.createElement("section");
    workbench.id = "studio-bridge-workbench";
    workbench.className = "studio-workbench";
    workbench.setAttribute("aria-label", "AI Bridge channels");
    workbench.innerHTML = `
      <header class="studio-topbar">
        <div class="studio-topbar-title">AI Channels</div>
        <div class="studio-status" id="studio-bridge-live-state" data-state="busy">connecting</div>
        <code class="studio-bridge-route" id="studio-bridge-route">local</code>
        <button class="studio-button" id="studio-bridge-refresh">Refresh</button>
      </header>
      <div class="studio-bridge-main">
        <section class="studio-bridge-stream">
          <header class="studio-bridge-stream-head">
            <div>
              <span>Sealed message stream</span>
              <strong id="studio-bridge-channel-name">All peers</strong>
            </div>
            <code id="studio-bridge-count">0 records</code>
          </header>
          <div class="studio-bridge-feed" id="studio-bridge-feed">
            <div class="studio-empty">Loading AI Bridge envelopes...</div>
          </div>
        </section>
        <aside class="studio-bridge-detail" id="studio-bridge-detail">
          <div class="studio-bridge-detail-empty">
            Select an envelope to inspect its seal and execution metadata.
          </div>
        </aside>
      </div>
    `;
    byId("ec").appendChild(workbench);

    byId("studio-bridge-side-refresh").addEventListener("click", () =>
      refreshBridge(),
    );
    byId("studio-bridge-refresh").addEventListener("click", () =>
      refreshBridge(),
    );
  }

  function bridgeTime(value) {
    if (!value) return "time unavailable";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function bridgeIntegrity(value) {
    if (value === true) return { label: "seal verified", state: "ready" };
    if (value === false) return { label: "seal mismatch", state: "offline" };
    return { label: "no payload", state: "idle" };
  }

  function renderBridgeStatus() {
    const status = state.bridge.status;
    if (!status) return;
    const sender = status.sender_ready ? "send + receive" : "receive + reply";
    byId("studio-bridge-side-status").innerHTML = `
      <div class="studio-bridge-node">
        <div class="studio-status" data-state="${status.ready ? "ready" : "offline"}">
          ${status.ready ? "bridge online" : "bridge offline"}
        </div>
        <strong>${escapeHtml(status.local_host || "local node")}</strong>
        <span>${escapeHtml(sender)} · ${escapeHtml(status.peer_count)} peer${status.peer_count === 1 ? "" : "s"}</span>
      </div>
    `;
    const liveState = byId("studio-bridge-live-state");
    liveState.dataset.state = status.ready ? "ready" : "offline";
    liveState.textContent = status.ready ? "polling every 2s" : "offline";
    byId("studio-bridge-route").textContent =
      `${status.local_host || "local"} / ${status.transport || "bridge"}`;
  }

  function renderBridgePeers() {
    const counts = new Map();
    for (const record of state.bridge.allRecords) {
      counts.set(record.peer, (counts.get(record.peer) || 0) + 1);
    }
    const statusPeers = state.bridge.status?.peers || [];
    const peers = [...new Set([...statusPeers, ...counts.keys()])].sort();
    const rows = [
      {
        peer: "",
        label: "All peers",
        count: state.bridge.allRecords.length,
      },
      ...peers.map((peer) => ({
        peer,
        label: peer,
        count: counts.get(peer) || 0,
      })),
    ];
    byId("studio-bridge-peers").innerHTML = rows
      .map(
        (row) => `
          <button class="studio-side-row ${state.bridge.peer === row.peer ? "studio-selected" : ""}" data-bridge-peer="${escapeHtml(row.peer)}">
            <b>${escapeHtml(row.label)}</b>
            <small>${row.count} sealed envelope${row.count === 1 ? "" : "s"}</small>
          </button>
        `,
      )
      .join("");
    byId("studio-bridge-peers")
      .querySelectorAll("[data-bridge-peer]")
      .forEach((button) => {
        button.addEventListener("click", async () => {
          state.bridge.peer = button.dataset.bridgePeer || "";
          state.bridge.selectedId = "";
          state.bridge.records = state.bridge.peer
            ? state.bridge.allRecords.filter(
                (record) => record.peer === state.bridge.peer,
              )
            : [...state.bridge.allRecords];
          renderBridgePeers();
          renderBridgeRecords();
          await refreshBridge({ silent: true });
        });
      });
  }

  function renderBridgeDetail(record) {
    const detail = byId("studio-bridge-detail");
    if (!record) {
      detail.innerHTML = `
        <div class="studio-bridge-detail-empty">
          Select an envelope to inspect its seal and execution metadata.
        </div>
      `;
      return;
    }
    const messageSeal = bridgeIntegrity(record.message_integrity);
    const replySeal = bridgeIntegrity(record.reply_integrity);
    detail.innerHTML = `
      <header>
        <span>Envelope detail</span>
        <strong>${escapeHtml(record.id)}</strong>
      </header>
      <div class="studio-bridge-detail-grid">
        <span>Peer</span><code>${escapeHtml(record.peer)}</code>
        <span>Status</span><code>${escapeHtml(record.status)}</code>
        <span>Agent</span><code>${escapeHtml(record.agent || "not recorded")}</code>
        <span>Sandbox</span><code>${escapeHtml(record.sandbox || "not recorded")}</code>
        <span>Ephemeral</span><code>${escapeHtml(record.ephemeral ?? "not recorded")}</code>
      </div>
      <section>
        <div class="studio-bridge-seal-head">
          <span>Message SHA-256</span>
          <b data-state="${messageSeal.state}">${messageSeal.label}</b>
        </div>
        <code class="studio-bridge-hash">${escapeHtml(record.message_sha256 || "not present")}</code>
      </section>
      <section>
        <div class="studio-bridge-seal-head">
          <span>Reply SHA-256</span>
          <b data-state="${replySeal.state}">${replySeal.label}</b>
        </div>
        <code class="studio-bridge-hash">${escapeHtml(record.reply_sha256 || "not present")}</code>
      </section>
      <footer class="studio-bridge-send-state">
        <strong>Outbound initiator unavailable on this node</strong>
        <span>The sidekick can initiate an authenticated request. This Studio reads the sealed channel and displays its protected reply without inventing a sender.</span>
      </footer>
    `;
  }

  function selectBridgeRecord(messageId) {
    state.bridge.selectedId = messageId;
    document
      .querySelectorAll("[data-bridge-record]")
      .forEach((card) =>
        card.classList.toggle(
          "studio-selected",
          card.dataset.bridgeRecord === messageId,
        ),
      );
    renderBridgeDetail(
      state.bridge.records.find((record) => record.id === messageId),
    );
  }

  function renderBridgeRecords() {
    const feed = byId("studio-bridge-feed");
    const channelName = state.bridge.peer || "All peers";
    byId("studio-bridge-channel-name").textContent = channelName;
    byId("studio-bridge-count").textContent =
      `${state.bridge.records.length} record${state.bridge.records.length === 1 ? "" : "s"}`;

    if (!state.bridge.records.length) {
      feed.innerHTML = `
        <div class="studio-empty">
          No envelopes in this channel yet.
        </div>
      `;
      renderBridgeDetail(null);
      return;
    }

    feed.innerHTML = state.bridge.records
      .map((record) => {
        const messageSeal = bridgeIntegrity(record.message_integrity);
        const replySeal = bridgeIntegrity(record.reply_integrity);
        const timestamp = record.sent_utc || record.received_utc;
        return `
          <article class="studio-bridge-card ${state.bridge.selectedId === record.id ? "studio-selected" : ""}" tabindex="0" data-bridge-record="${escapeHtml(record.id)}">
            <header>
              <div>
                <strong>${escapeHtml(record.peer)}</strong>
                <span>${escapeHtml(bridgeTime(timestamp))}</span>
              </div>
              <code>${escapeHtml(record.status)}</code>
            </header>
            <div class="studio-bridge-hop">
              <span>${escapeHtml(record.peer)}</span>
              <i>-></i>
              <span>${escapeHtml(record.local_host)}</span>
            </div>
            <p>${escapeHtml(record.message || "(reply-only envelope)")}</p>
            ${
              record.reply
                ? `<div class="studio-bridge-reply"><span>Protected reply</span><p>${escapeHtml(record.reply)}</p></div>`
                : `<div class="studio-bridge-pending">Reply not present</div>`
            }
            <footer>
              <span data-state="${messageSeal.state}">${messageSeal.label}</span>
              <span data-state="${replySeal.state}">${replySeal.label}</span>
              <code>${escapeHtml(record.id.slice(0, 8))}</code>
            </footer>
          </article>
        `;
      })
      .join("");

    feed.querySelectorAll("[data-bridge-record]").forEach((card) => {
      const select = () => selectBridgeRecord(card.dataset.bridgeRecord || "");
      card.addEventListener("click", select);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      });
    });
    const selected = state.bridge.records.find(
      (record) => record.id === state.bridge.selectedId,
    );
    renderBridgeDetail(selected || state.bridge.records[0]);
    if (!selected) {
      state.bridge.selectedId = state.bridge.records[0].id;
      selectBridgeRecord(state.bridge.selectedId);
    }
  }

  async function refreshBridge({ silent = false } = {}) {
    if (!state.session.features.ai_bridge || state.bridge.loading) return;
    state.bridge.loading = true;
    const liveState = byId("studio-bridge-live-state");
    if (liveState) {
      liveState.dataset.state = "busy";
      liveState.textContent = "refreshing";
    }
    try {
      const [status, messages] = await Promise.all([
        api("/bridge/status"),
        api("/bridge/messages?limit=200"),
      ]);
      state.bridge.status = status;
      state.bridge.allRecords = messages.records || [];
      state.bridge.records = state.bridge.peer
        ? state.bridge.allRecords.filter(
            (record) => record.peer === state.bridge.peer,
          )
        : [...state.bridge.allRecords];
      renderBridgeStatus();
      renderBridgePeers();
      renderBridgeRecords();
      if (!silent) toast("AI channels refreshed", "success");
    } catch (error) {
      if (liveState) {
        liveState.dataset.state = "offline";
        liveState.textContent = "unavailable";
      }
      if (!silent) toast(`AI Bridge error: ${error.message}`, "error");
    } finally {
      state.bridge.loading = false;
    }
  }

  function stopBridgePolling() {
    if (state.bridge.timer) {
      window.clearInterval(state.bridge.timer);
      state.bridge.timer = null;
    }
  }

  function startBridgePolling() {
    stopBridgePolling();
    const interval = Math.max(
      1000,
      Number(state.bridge.status?.poll_seconds || 2) * 1000,
    );
    state.bridge.timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        byId("studio-bridge-workbench")?.classList.contains("studio-on")
      ) {
        refreshBridge({ silent: true });
      }
    }, interval);
  }

  async function showBridgeChannels() {
    if (!state.session.features.ai_bridge) {
      toast("AI Bridge is available only in the owner workspace.", "error");
      return;
    }
    showSurface(
      "studio-bridge-workbench",
      "sv-studio-bridge",
      "studio-bridge-activity",
    );
    await refreshBridge({ silent: true });
    startBridgePolling();
  }

  function installTools() {
    if (byId("studio-tools-workbench")) return;
    const side = document.createElement("div");
    side.id = "sv-studio-tools";
    side.className = "sidev";
    side.innerHTML = `
      <div class="studio-side-head">
        <span>Tool Bus</span>
        <button class="studio-icon-button" id="studio-tools-refresh" title="Refresh capabilities" aria-label="Refresh capabilities">↻</button>
      </div>
      <div class="studio-side-body" id="studio-tools-side-list">
        <div class="studio-empty">Loading capability registry...</div>
      </div>
    `;
    byId("side").appendChild(side);

    const workbench = document.createElement("section");
    workbench.id = "studio-tools-workbench";
    workbench.className = "studio-workbench";
    workbench.setAttribute("aria-label", "Clay and GeoSeal tool bus");
    workbench.innerHTML = `
      <header class="studio-topbar">
        <div class="studio-topbar-title">Clay Tool Bus</div>
        <div class="studio-status" id="studio-tools-status" data-state="offline">checking</div>
        <button class="studio-button" data-studio-command="geoseal providers --json">Providers</button>
        <button class="studio-button" data-studio-command="geoseal permissions --json">Permissions</button>
        <button class="studio-button studio-button-primary" data-studio-command="geoseal doctor --json">Doctor</button>
      </header>
      <div class="studio-tools-main">
        <section class="studio-tool-index">
          <div class="studio-tool-summary" id="studio-tool-summary"></div>
          <div id="studio-lane-list"><div class="studio-empty">No capability manifest loaded.</div></div>
        </section>
        <section class="studio-tool-console">
          <div class="studio-command-bar">
            <input class="studio-input" id="studio-command-input" value="geoseal doctor --json" aria-label="GeoSeal command">
            <button class="studio-button studio-button-primary" id="studio-command-run">Run</button>
          </div>
          <pre class="studio-console-output" id="studio-command-output">Select a registered GeoSeal command or type one above.</pre>
          <footer class="studio-console-footer">
            <span id="studio-command-meta">No command run</span>
            <button class="studio-button" id="studio-command-save" disabled>Save receipt to workspace</button>
          </footer>
        </section>
      </div>
    `;
    byId("ec").appendChild(workbench);

    byId("studio-tools-refresh").addEventListener("click", loadHarnessManifest);
    byId("studio-command-run").addEventListener("click", runToolCommand);
    byId("studio-command-input").addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runToolCommand();
      }
    });
    byId("studio-command-save").addEventListener("click", saveToolReceipt);
    workbench.querySelectorAll("[data-studio-command]").forEach((button) => {
      button.addEventListener("click", () => {
        byId("studio-command-input").value = button.dataset.studioCommand;
        runToolCommand();
      });
    });
  }

  function splitCommand(value) {
    const result = [];
    let token = "";
    let quote = "";
    let escaped = false;
    for (const character of String(value).trim()) {
      if (escaped) {
        token += character;
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (quote) {
        if (character === quote) quote = "";
        else token += character;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (/\s/.test(character)) {
        if (token) {
          result.push(token);
          token = "";
        }
      } else {
        token += character;
      }
    }
    if (quote) throw new Error("Unclosed quote in command.");
    if (escaped) token += "\\";
    if (token) result.push(token);
    return result;
  }

  async function loadHarnessManifest() {
    const status = byId("studio-tools-status");
    if (!state.session.features.geoseal_cli) {
      status.dataset.state = "offline";
      status.textContent = "browser-only";
      renderToolManifest();
      return;
    }
    status.dataset.state = "busy";
    status.textContent = "probing";
    try {
      state.manifest = await api("/harness/manifest");
      status.dataset.state = state.manifest.ok ? "ready" : "offline";
      status.textContent = state.manifest.ok ? "ready" : "check";
      renderToolManifest();
    } catch (error) {
      status.dataset.state = "offline";
      status.textContent = "offline";
      byId("studio-command-output").textContent = error.message;
      renderToolManifest();
    }
  }

  function renderToolManifest() {
    const manifest = state.manifest;
    const features = state.session.features || {};
    const ownerToolsReady = Boolean(features.geoseal_cli);
    const clayTools = manifest?.clay_tools || [];
    const lanes = manifest?.geoseal?.lanes?.lanes || [];
    const providers = manifest?.geoseal?.providers?.providers || [];
    const readyProviders = providers.filter(
      (provider) => provider.installed || provider.configured,
    ).length;
    if (!ownerToolsReady) {
      const status = byId("studio-tools-status");
      status.dataset.state = "offline";
      status.textContent = "owner only";
      byId("studio-command-input").disabled = true;
      byId("studio-command-run").disabled = true;
      byId("studio-command-output").textContent =
        "Clay and GeoSeal commands run only in the loopback owner workspace.";
      byId("studio-tools-workbench")
        .querySelectorAll("[data-studio-command]")
        .forEach((button) => {
          button.disabled = true;
        });
    }
    byId("studio-tool-summary").innerHTML = `
      <div class="studio-metric"><strong>${clayTools.length || "—"}</strong><span>Clay tools</span></div>
      <div class="studio-metric"><strong>${lanes.length || "—"}</strong><span>GeoSeal lanes</span></div>
      <div class="studio-metric"><strong>${readyProviders || "—"}</strong><span>Providers ready</span></div>
    `;
    if (!lanes.length) {
      byId("studio-lane-list").innerHTML = `
        <div class="studio-empty">${features.geoseal_cli ? "Capability probe did not return lanes." : "GeoSeal runs only in the owner workspace."}</div>
      `;
    } else {
      byId("studio-lane-list").innerHTML = lanes
        .map(
          (lane) => `
            <div class="studio-lane">
              <h3>${escapeHtml(lane.id)}</h3>
              <p>${escapeHtml(lane.purpose)}</p>
              ${(lane.commands || [])
                .map(
                  (command) =>
                    `<button class="studio-command-chip" data-command="${escapeHtml(command)}">${escapeHtml(command)}</button>`,
                )
                .join("")}
            </div>
          `,
        )
        .join("");
      byId("studio-lane-list")
        .querySelectorAll("[data-command]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            const command = button.dataset.command.includes("--json")
              ? button.dataset.command
              : `${button.dataset.command} --json`;
            byId("studio-command-input").value = command;
            runToolCommand();
          });
        });
    }

    const sideRows = lanes.length
      ? lanes
          .map(
            (lane) => `
              <button class="studio-side-row" data-lane-command="${escapeHtml((lane.commands || [])[0] || "geoseal doctor")}">
                <b>${escapeHtml(lane.id)}</b>
                <small>${escapeHtml((lane.commands || []).length)} routes</small>
              </button>
            `,
          )
          .join("")
      : `<div class="studio-empty">Owner runtime not connected.</div>`;
    byId("studio-tools-side-list").innerHTML = sideRows;
    byId("studio-tools-side-list")
      .querySelectorAll("[data-lane-command]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          showSurface(
            "studio-tools-workbench",
            "sv-studio-tools",
            "studio-tools-activity",
          );
          byId("studio-command-input").value = button.dataset.laneCommand;
        });
      });
  }

  async function runGeoSealArgs(args, outputTarget = byId("studio-command-output")) {
    if (!state.session.features.geoseal_cli) {
      throw new Error("GeoSeal CLI is available only in the owner runtime.");
    }
    const response = await api("/geoseal/execute", {
      method: "POST",
      body: JSON.stringify({ args }),
    });
    state.lastToolResult = response;
    outputTarget.textContent = response.json
      ? JSON.stringify(response.json, null, 2)
      : [response.stdout, response.stderr].filter(Boolean).join("\n") ||
        `GeoSeal exited ${response.exit_code}.`;
    return response;
  }

  async function runToolCommand() {
    const input = byId("studio-command-input");
    const status = byId("studio-tools-status");
    let args;
    try {
      args = splitCommand(input.value);
      if (args[0]?.toLowerCase() === "geoseal") args.shift();
      if (!args.length) throw new Error("Enter a GeoSeal command.");
    } catch (error) {
      byId("studio-command-output").textContent = error.message;
      return;
    }
    status.dataset.state = "busy";
    status.textContent = "running";
    byId("studio-command-run").disabled = true;
    byId("studio-command-save").disabled = true;
    byId("studio-command-output").textContent = `geoseal ${args.join(" ")}\n\nRunning...`;
    try {
      const response = await runGeoSealArgs(args);
      status.dataset.state = response.ok ? "ready" : "offline";
      status.textContent = response.ok ? "ready" : `exit ${response.exit_code}`;
      byId("studio-command-meta").textContent =
        `${response.elapsed_ms} ms · exit ${response.exit_code}`;
      byId("studio-command-save").disabled = false;
    } catch (error) {
      status.dataset.state = "offline";
      status.textContent = "error";
      byId("studio-command-output").textContent = error.message;
      byId("studio-command-meta").textContent = "Command did not complete";
    } finally {
      byId("studio-command-run").disabled = false;
    }
  }

  function saveToolReceipt() {
    if (!state.lastToolResult) return;
    const app = window._app;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `/workspace/project/.clay/receipts/geoseal-${stamp}.json`;
    app.fs.write(path, `${JSON.stringify(state.lastToolResult, null, 2)}\n`);
    app.sidebar?.renderTree?.();
    app.openFile(path, app.fs.read(path));
    toast("Receipt saved to the browser workspace", "success");
  }

  function installMedia() {
    if (byId("studio-media-workbench")) return;
    const side = document.createElement("div");
    side.id = "sv-studio-media";
    side.className = "sidev";
    side.innerHTML = `
      <div class="studio-side-head">
        <span>Media Studio</span>
        <span id="studio-media-count">0 cues</span>
      </div>
      <div class="studio-side-body">
        <div class="studio-side-section">
          <div class="studio-side-label">Sources</div>
          <button class="studio-side-row" id="studio-media-import-captions">
            <b>Import transcript</b><small>VTT, SRT, TXT, or JSON</small>
          </button>
          <button class="studio-side-row" id="studio-media-import-file">
            <b>Open local media</b><small>video or audio stays in this browser</small>
          </button>
        </div>
        <div class="studio-side-section">
          <div class="studio-side-label">Workspace</div>
          <button class="studio-side-row" id="studio-media-save-notes">
            <b>Save notes</b><small>write Markdown to virtual workspace</small>
          </button>
        </div>
      </div>
    `;
    byId("side").appendChild(side);

    const workbench = document.createElement("section");
    workbench.id = "studio-media-workbench";
    workbench.className = "studio-workbench";
    workbench.setAttribute("aria-label", "Media and transcript studio");
    workbench.innerHTML = `
      <header class="studio-topbar">
        <div class="studio-topbar-title">Media Studio</div>
        <input class="studio-input studio-media-url" id="studio-media-url" placeholder="YouTube URL or video ID" aria-label="YouTube URL">
        <button class="studio-button" id="studio-media-load">Load</button>
        <button class="studio-button studio-button-primary" id="studio-media-fetch">Fetch transcript</button>
        <select class="studio-select" id="studio-media-export-format" aria-label="Export format">
          <option value="vtt">VTT</option>
          <option value="srt">SRT</option>
          <option value="txt">Text</option>
          <option value="json">JSON</option>
        </select>
        <button class="studio-icon-button" id="studio-media-export" title="Download transcript" aria-label="Download transcript">↓</button>
        <button class="studio-icon-button" id="studio-media-write" title="Write transcript to workspace" aria-label="Write transcript to workspace">↳</button>
      </header>
      <div class="studio-media-main">
        <section class="studio-media-stage">
          <div class="studio-video-shell">
            <div class="studio-video-empty" id="studio-video-empty">Load a YouTube URL or local media file.</div>
            <iframe id="studio-video-frame" hidden title="YouTube player" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            <video id="studio-local-video" hidden controls></video>
          </div>
          <div class="studio-notes">
            <label class="studio-label" for="studio-media-notes">Session notes</label>
            <textarea class="studio-textarea" id="studio-media-notes" placeholder="Notes, edit decisions, and timestamps..."></textarea>
          </div>
        </section>
        <section class="studio-media-editor">
          <div class="studio-cue-toolbar">
            <input class="studio-input" id="studio-cue-search" placeholder="Filter transcript..." aria-label="Filter transcript">
            <button class="studio-button" id="studio-cue-add">Add cue</button>
          </div>
          <div class="studio-cue-list" id="studio-cue-list">
            <div class="studio-empty">Import or fetch a transcript to edit cues.</div>
          </div>
          <div class="studio-cue-detail">
            <input class="studio-input" id="studio-cue-start" placeholder="00:00:00.000" aria-label="Cue start">
            <input class="studio-input" id="studio-cue-end" placeholder="00:00:05.000" aria-label="Cue end">
            <textarea class="studio-textarea" id="studio-cue-text" placeholder="Select a cue to edit" aria-label="Cue text"></textarea>
            <button class="studio-button studio-button-primary" id="studio-cue-apply">Apply</button>
          </div>
        </section>
      </div>
      <input class="studio-file-input" id="studio-caption-file" type="file" accept=".vtt,.srt,.txt,.json,text/vtt,application/json,text/plain">
      <input class="studio-file-input" id="studio-media-file" type="file" accept="video/*,audio/*">
    `;
    byId("ec").appendChild(workbench);

    byId("studio-media-load").addEventListener("click", loadYouTube);
    byId("studio-media-url").addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadYouTube();
    });
    byId("studio-media-fetch").addEventListener("click", fetchTranscript);
    byId("studio-media-export").addEventListener("click", downloadTranscript);
    byId("studio-media-write").addEventListener("click", writeTranscript);
    byId("studio-media-import-captions").addEventListener("click", () =>
      byId("studio-caption-file").click(),
    );
    byId("studio-media-import-file").addEventListener("click", () =>
      byId("studio-media-file").click(),
    );
    byId("studio-caption-file").addEventListener("change", importTranscript);
    byId("studio-media-file").addEventListener("change", openLocalMedia);
    byId("studio-media-save-notes").addEventListener("click", saveMediaNotes);
    byId("studio-cue-search").addEventListener("input", renderCues);
    byId("studio-cue-add").addEventListener("click", addCue);
    byId("studio-cue-apply").addEventListener("click", applyCue);
    byId("studio-media-fetch").disabled =
      !state.session.features.youtube_transcript_fetch;
    renderCues();
  }

  function youtubeId(value) {
    const raw = String(value || "").trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
    try {
      const url = new URL(raw);
      if (url.hostname === "youtu.be") {
        return url.pathname.split("/").filter(Boolean)[0] || "";
      }
      if (
        url.hostname === "youtube.com" ||
        url.hostname.endsWith(".youtube.com")
      ) {
        if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || "";
        if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || "";
        return url.searchParams.get("v") || "";
      }
    } catch (_error) {
      return "";
    }
    return "";
  }

  function showYoutubeAt(seconds = 0) {
    if (!state.videoId) return;
    if (state.localMediaUrl) {
      URL.revokeObjectURL(state.localMediaUrl);
      state.localMediaUrl = "";
    }
    byId("studio-video-empty").hidden = true;
    byId("studio-local-video").hidden = true;
    const frame = byId("studio-video-frame");
    frame.hidden = false;
    const start = Math.max(0, Math.floor(Number(seconds || 0)));
    frame.src =
      `https://www.youtube-nocookie.com/embed/${encodeURIComponent(state.videoId)}` +
      `?rel=0&modestbranding=1&start=${start}`;
  }

  function loadYouTube() {
    const id = youtubeId(byId("studio-media-url").value);
    if (!id) {
      toast("Enter a valid YouTube URL or video ID", "error");
      return;
    }
    state.videoId = id;
    state.mediaTitle = `youtube-${id}`;
    showYoutubeAt(0);
  }

  async function fetchTranscript() {
    const value = byId("studio-media-url").value.trim();
    if (!youtubeId(value)) {
      toast("Load a valid YouTube URL first", "error");
      return;
    }
    const button = byId("studio-media-fetch");
    button.disabled = true;
    button.textContent = "Fetching...";
    try {
      const response = await api("/media/youtube/transcript", {
        method: "POST",
        body: JSON.stringify({ url: value }),
      });
      const parsed = window.ClayCaptionUtils.parseCaption(
        response.transcript,
        `transcript.${response.format || "vtt"}`,
      );
      state.cues = parsed.cues;
      state.selectedCue = state.cues.length ? 0 : -1;
      state.videoId = response.video_id || state.videoId;
      state.mediaTitle = response.title || `youtube-${state.videoId}`;
      showYoutubeAt(0);
      renderCues();
      toast(`Loaded ${state.cues.length} transcript cues`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = !state.session.features.youtube_transcript_fetch;
      button.textContent = "Fetch transcript";
    }
  }

  async function importTranscript(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = window.ClayCaptionUtils.parseCaption(
        await file.text(),
        file.name,
      );
      state.cues = parsed.cues;
      state.selectedCue = state.cues.length ? 0 : -1;
      state.mediaTitle = window.ClayCaptionUtils.safeBasename(file.name);
      renderCues();
      toast(`Imported ${state.cues.length} cues`, "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      event.target.value = "";
    }
  }

  function openLocalMedia(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (state.localMediaUrl) URL.revokeObjectURL(state.localMediaUrl);
    state.localMediaUrl = URL.createObjectURL(file);
    state.videoId = "";
    state.mediaTitle = window.ClayCaptionUtils.safeBasename(file.name, "media");
    const player = byId("studio-local-video");
    player.src = state.localMediaUrl;
    player.hidden = false;
    byId("studio-video-frame").hidden = true;
    byId("studio-video-frame").src = "";
    byId("studio-video-empty").hidden = true;
    event.target.value = "";
  }

  function cueClock(seconds) {
    return window.ClayCaptionUtils.formatTimestamp(seconds).slice(0, 8);
  }

  function renderCues() {
    const query = String(byId("studio-cue-search")?.value || "").toLowerCase();
    const rows = state.cues
      .map((cue, index) => ({ cue, index }))
      .filter(({ cue }) => !query || cue.text.toLowerCase().includes(query));
    byId("studio-media-count").textContent = `${state.cues.length} cues`;
    const list = byId("studio-cue-list");
    if (!rows.length) {
      list.innerHTML = `<div class="studio-empty">${state.cues.length ? "No matching cues." : "Import or fetch a transcript to edit cues."}</div>`;
    } else {
      list.innerHTML = rows
        .map(
          ({ cue, index }) => `
            <button class="studio-cue-row ${index === state.selectedCue ? "studio-selected" : ""}" data-cue-index="${index}">
              <span class="studio-cue-time">${escapeHtml(cueClock(cue.start))}</span>
              <span class="studio-cue-text">${escapeHtml(cue.text)}</span>
            </button>
          `,
        )
        .join("");
      list.querySelectorAll("[data-cue-index]").forEach((row) => {
        row.addEventListener("click", () => {
          state.selectedCue = Number(row.dataset.cueIndex);
          const cue = state.cues[state.selectedCue];
          if (state.videoId) showYoutubeAt(cue.start);
          const local = byId("studio-local-video");
          if (!local.hidden) local.currentTime = cue.start;
          renderCues();
        });
      });
    }
    renderCueDetail();
  }

  function renderCueDetail() {
    const cue = state.cues[state.selectedCue];
    byId("studio-cue-start").value = cue
      ? window.ClayCaptionUtils.formatTimestamp(cue.start)
      : "";
    byId("studio-cue-end").value = cue
      ? window.ClayCaptionUtils.formatTimestamp(cue.end)
      : "";
    byId("studio-cue-text").value = cue?.text || "";
  }

  function addCue() {
    const previous = state.cues[state.cues.length - 1];
    const start = previous ? previous.end : 0;
    state.cues.push({
      id: String(state.cues.length + 1),
      start,
      end: start + 5,
      text: "New cue",
    });
    state.selectedCue = state.cues.length - 1;
    renderCues();
    byId("studio-cue-text").focus();
    byId("studio-cue-text").select();
  }

  function applyCue() {
    const cue = state.cues[state.selectedCue];
    if (!cue) return;
    try {
      const start = window.ClayCaptionUtils.parseTimestamp(
        byId("studio-cue-start").value,
      );
      const end = window.ClayCaptionUtils.parseTimestamp(
        byId("studio-cue-end").value,
      );
      const text = byId("studio-cue-text").value.trim();
      if (end < start) throw new Error("Cue end must not precede cue start.");
      if (!text) throw new Error("Cue text is required.");
      Object.assign(cue, { start, end, text });
      state.cues = window.ClayCaptionUtils.normalizeCues(state.cues);
      state.selectedCue = state.cues.indexOf(cue);
      renderCues();
      toast("Cue updated", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function transcriptPayload() {
    const format = byId("studio-media-export-format").value;
    const content = window.ClayCaptionUtils.serialize(state.cues, format);
    const name = window.ClayCaptionUtils.safeBasename(
      state.mediaTitle,
      "transcript",
    );
    return { format, content, filename: `${name}.${format}` };
  }

  function downloadTranscript() {
    if (!state.cues.length) {
      toast("No transcript cues to export", "error");
      return;
    }
    const payload = transcriptPayload();
    const blob = new Blob([payload.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = payload.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function writeTranscript() {
    if (!state.cues.length) {
      toast("No transcript cues to write", "error");
      return;
    }
    const payload = transcriptPayload();
    const path = `/workspace/project/media/${payload.filename}`;
    window._app.fs.write(path, payload.content);
    window._app.sidebar?.renderTree?.();
    window._app.openFile(path, payload.content);
    toast("Transcript written to browser workspace", "success");
  }

  function saveMediaNotes() {
    const notes = byId("studio-media-notes").value.trim();
    const name = window.ClayCaptionUtils.safeBasename(state.mediaTitle, "media");
    const path = `/workspace/project/media/${name}-notes.md`;
    const source = state.videoId
      ? `https://www.youtube.com/watch?v=${state.videoId}`
      : "local browser media";
    const content = `# ${state.mediaTitle}\n\nSource: ${source}\n\n${notes}\n`;
    window._app.fs.write(path, content);
    window._app.sidebar?.renderTree?.();
    window._app.openFile(path, content);
    toast("Notes written to browser workspace", "success");
  }

  function wireTerminal() {
    const terminal = window._app.term;
    const originalRun = terminal.run.bind(terminal);
    terminal.repl = null;
    terminal.run = function runStudioCommand(command) {
      let args;
      try {
        args = splitCommand(command);
      } catch (error) {
        this.print(error.message, "e");
        return;
      }
      const name = String(args[0] || "").toLowerCase();
      if (name === "clay") {
        this.print(`$ ${command}`);
        const prompt = args.slice(1).join(" ");
        if (!prompt) {
          this.print('Usage: clay "question or task"', "w");
          return;
        }
        this.print("Clay is working through the local harness...", "i");
        api("/clay/chat", {
          method: "POST",
          body: JSON.stringify({
            prompt,
            active_file: window._app.af || "",
            content:
              window._app.af && window._app.editor
                ? window._app.editor.getValue()
                : "",
          }),
        })
          .then((response) => {
            this.print(response.answer || "(No answer returned.)");
            const tools = response.tools_used || [];
            if (tools.length) this.print(`tools: ${tools.join(", ")}`, "i");
          })
          .catch((error) => this.print(error.message, "e"));
        return;
      }
      if (name === "geoseal") {
        this.print(`$ ${command}`);
        this.print("GeoSeal command running...", "i");
        runGeoSealArgs(args.slice(1), {
          set textContent(value) {
            String(value)
              .split("\n")
              .forEach((line) => terminal.print(line));
          },
        }).catch((error) => terminal.print(error.message, "e"));
        return;
      }
      if (name === "host") {
        this.print(`$ ${command}`);
        const hostCommand = command.slice(command.indexOf(" ") + 1).trim();
        if (!hostCommand || hostCommand === command) {
          this.print("Usage: host <bounded read-only PowerShell command>", "w");
          return;
        }
        api("/host/execute", {
          method: "POST",
          body: JSON.stringify({ command: hostCommand }),
        })
          .then((response) => {
            String(response.output || `exit ${response.exit_code}`)
              .split("\n")
              .forEach((line) => this.print(line));
            this.print(response.guard, "i");
          })
          .catch((error) => this.print(error.message, "e"));
        return;
      }
      if (name === "studio") {
        showSurface(
          "studio-tools-workbench",
          "sv-studio-tools",
          "studio-tools-activity",
        );
        return;
      }
      if (name === "claude") {
        this.print(`$ ${command}`);
        this.print(
          "The old simulated Claude REPL is disabled. Use Clay here; use `clay claude` from a native terminal only when the installed Claude CLI is explicitly required.",
          "w",
        );
        return;
      }
      originalRun(command);
      if (name === "help") {
        this.print(
          "Studio: clay <prompt> | geoseal <args> | host <read-only PowerShell> | studio",
          "i",
        );
      }
    };
    terminal.print(
      "Clay Studio: clay <prompt> | geoseal <command> | studio",
      "i",
    );
  }

  function wireRealWorkspaceAudit() {
    const audit = window._app.audit;
    if (!audit) return;
    audit.updateCmd = () => {
      const type = byId("audit-type")?.value || "full";
      const command = byId("audit-cmd");
      if (command) command.textContent = `$ browser-workspace audit --type ${type}`;
    };
    audit.run = () => {
      const output = byId("audit-output");
      const type = byId("audit-type")?.value || "full";
      const files = Object.entries(window._app.fs.files)
        .filter(([, content]) => typeof content === "string")
        .map(([path, content]) => ({
          path,
          bytes: new Blob([content]).size,
          lines: content.split("\n").length,
          content,
        }));
      const largest = [...files]
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, Math.max(1, Number(byId("audit-top")?.value || 20)));
      const extensions = {};
      for (const file of files) {
        const match = file.path.match(/(\.[A-Za-z0-9_-]+)$/);
        const extension = match?.[1].toLowerCase() || "(none)";
        extensions[extension] = (extensions[extension] || 0) + 1;
      }
      const secretPatterns = [
        /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}/gi,
        /\bAKIA[0-9A-Z]{16}\b/g,
        /\bsk-[A-Za-z0-9_-]{16,}\b/g,
      ];
      const findings = [];
      for (const file of files) {
        const count = secretPatterns.reduce(
          (total, pattern) => total + [...file.content.matchAll(pattern)].length,
          0,
        );
        if (count) findings.push({ path: file.path, count });
      }
      const sections = [];
      if (type === "hotfiles" || type === "full") {
        sections.push(
          [
            "WORKSPACE SIZE",
            ...largest.map(
              (file, index) =>
                `${String(index + 1).padStart(2)}  ${String(file.bytes).padStart(8)} B  ${String(file.lines).padStart(5)} lines  ${file.path}`,
            ),
          ].join("\n"),
        );
      }
      if (type === "ownership" || type === "full") {
        sections.push(
          [
            "FILE TYPES",
            ...Object.entries(extensions)
              .sort((left, right) => right[1] - left[1])
              .map(([extension, count]) => `${String(count).padStart(4)}  ${extension}`),
            "",
            "Ownership data is unavailable in the browser-only virtual filesystem.",
          ].join("\n"),
        );
      }
      if (type === "secrets" || type === "full") {
        sections.push(
          [
            "SECRET PATTERN SCAN",
            findings.length
              ? `${findings.length} files need review; values are intentionally not displayed.`
              : "No configured secret pattern matched.",
            ...findings.map(
              (finding) => `${finding.count} potential match(es)  ${finding.path}`,
            ),
          ].join("\n"),
        );
      }
      audit.updateCmd();
      output.textContent = sections.join("\n\n");
      toast(`Audited ${files.length} browser-workspace files`, "success");
    };
    audit.updateCmd();
  }

  function wireActivityBar() {
    const clayIcon = replaceActivityIcon('[data-v="ai"]', {
      id: "studio-clay-activity",
      title: "Clay",
      text: "◆",
    });
    const mediaIcon = replaceActivityIcon('[data-v="youtube"]', {
      id: "studio-media-activity",
      title: "Media Studio",
      text: "▶",
    });
    const toolsIcon = installActivityIcon({
      id: "studio-tools-activity",
      title: "Clay Tool Bus",
      text: "◎",
    });
    const bridgeIcon = state.session.features.ai_bridge
      ? installActivityIcon({
          id: "studio-bridge-activity",
          title: "AI Channels",
          text: "⇄",
        })
      : null;
    clayIcon.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      openClayChat();
    });
    mediaIcon.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      showSurface(
        "studio-media-workbench",
        "sv-studio-media",
        "studio-media-activity",
      );
    });
    toolsIcon.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      showSurface(
        "studio-tools-workbench",
        "sv-studio-tools",
        "studio-tools-activity",
      );
    });
    bridgeIcon?.addEventListener("click", (event) => {
      event.stopImmediatePropagation();
      showBridgeChannels();
    });
    byId("actbar").addEventListener(
      "click",
      (event) => {
        const icon = event.target.closest(".ai");
        if (
          icon &&
          ![
            "studio-clay-activity",
            "studio-media-activity",
            "studio-tools-activity",
            "studio-bridge-activity",
          ].includes(icon.id)
        ) {
          hideStudioSurfaces();
          if (window.matchMedia("(max-width: 680px)").matches) {
            byId("side")?.classList.toggle("studio-mobile-side-open");
          }
        }
      },
      true,
    );
    byId("ec")?.addEventListener("click", () => {
      byId("side")?.classList.remove("studio-mobile-side-open");
    });
  }

  async function install() {
    await loadSession();
    await waitForApp();
    setBrand();
    installRuntimeSidebar();
    installTools();
    installMedia();
    installBridge();
    wireClayChat();
    wireTerminal();
    wireRealWorkspaceAudit();
    wireActivityBar();
    renderRuntime();
    renderToolManifest();
    if (state.session.features.geoseal_cli) {
      loadHarnessManifest();
    }
    window.ClayStudio = {
      api,
      openChat: openClayChat,
      showMedia: () =>
        showSurface(
          "studio-media-workbench",
          "sv-studio-media",
          "studio-media-activity",
        ),
      showTools: () =>
        showSurface(
          "studio-tools-workbench",
          "sv-studio-tools",
          "studio-tools-activity",
        ),
      showBridge: showBridgeChannels,
      state,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      install().catch((error) => console.error("Clay Studio install failed:", error));
    });
  } else {
    install().catch((error) => console.error("Clay Studio install failed:", error));
  }
})();
