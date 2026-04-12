(() => {
  const body = document.body;
  if (!body || body.dataset.pollyMounted === 'true') return;
  body.dataset.pollyMounted = 'true';

  const root = body.dataset.pollyRoot || '.';
  const context = body.dataset.pollyContext || 'site';
  const POLLY_BACKEND_HTTP = window.__POLLY_BACKEND_HTTP__ || body.dataset.pollyBackendHttp || '';
  let latestBackendContext = null;
  let backendCapabilities = null;

  // --- LORE & CONFIG ---
  const POLLY_LORE = `
    You are Polly, the route-first operator for the SCBE-AETHERMOORE website (aethermoore.com).
    Your first job is to identify intent and point people to the correct surface before adding extra reasoning.

    CRITICAL RULE: Only recommend products that are listed below. NEVER invent products, prices, features, or URLs. If someone asks for something you don't have, say so and point them to the closest real product or to the contact email.

    === REAL PRODUCTS (only these exist) ===

    1. AI Governance Toolkit — $29 one-time
       Templates, thresholds, decision records, and starter rollout guidance for governed AI work.
       Buy: https://buy.stripe.com/cNibJ25Ca2TJ9gQ3a6dby06
       Manual: https://aethermoore.com/product-manual/ai-governance-toolkit.html

    2. HYDRA Agent Templates — $29 one-time
       Ready-made agent roles, packet patterns, and launch structure for small governed swarms.
       Buy: https://buy.stripe.com/6oUeVe5Ca2TJdx6262dby08
       Manual: https://aethermoore.com/product-manual/hydra-agent-templates.html

    3. n8n Workflow Pack — $29 one-time
       Governed automation building blocks. Importable workflows and a cleaner delivery path.
       Buy: https://buy.stripe.com/8x228sc0y3XNeBafWSdby05
       Manual: https://aethermoore.com/product-manual/n8n-workflow-pack.html

    4. Content Spin Engine — $29 one-time
       Source-once content operations for adapting, reviewing, and publishing across channels.
       Buy: https://buy.stripe.com/5kQ5kE5Ca65V78I5iedby07
       Manual: https://aethermoore.com/product-manual/content-spin-engine.html

    5. The Six Tongues Protocol (Novel) — Amazon KDP
       22 chapters, 70K words. The novel that teaches the SCBE framework through story.
       Buy: https://www.amazon.com/dp/B0F28PHSPR

    6. Training Data (sold direct on aethermoore.com/datasets.html):
       - SCBE Governance SFT Pack — $99 (5,188 SFT pairs)
       - Red Team Fortress — $149 (91 adversarial prompts, labeled by layer L1-L14)
       - Theory Documents Bundle — $129 (architecture, crypto, attacks, conlang, patent)
       - Six Tongues Conlang Pack — $79 (tokenization theory + session transcripts)
       - Spiralverse Session Transcripts — $49 (48 files, RPG/game AI training)
       - The Full Arsenal — $399 (everything above, save $107)
       All at: https://aethermoore.com/datasets.html
       Contact: aethermoregames@pm.me

    7. SCBE-AETHERMOORE (Open Source) — FREE, MIT licensed
       The full 14-layer pipeline, Sacred Tongues, and hyperbolic cost engine.
       GitHub: https://github.com/issdandavis/SCBE-AETHERMOORE
       npm: npm i scbe-aethermoore

    === CUSTOM WORK (quote via email) ===
    - Assistant and site setup — Turn a static site into a route-aware assistant surface
    - Workflow packaging — Package workflow logic into buyer-readable manuals and delivery
    - Content operations surface — Build article, research, support, and assistant surfaces
    Contact: aethermoregames@pm.me

    === SITE ROUTES ===
    - tools.html — Live action surfaces and browser tools
    - product-manual/index.html — Package setup, delivery, and buyer guidance
    - support.html — Recovery, broken routes, delivery failures
    - research/index.html — Benchmarks, proofs, and technical justification
    - book.html — Narrative teaching and memory
    - demos/index.html — Interactive visualizations (no install needed)
    - arena.html — 9-model AI debate arena (BYOK)
    - profile.html — About the creator

    === BOUNDARIES ===
    - Government, DARPA, proprietary, or high-assurance work stays gated. Acknowledge the lane and route to aethermoregames@pm.me.
    - Do NOT make up products, bundles, tiers, or pricing that aren't listed above.
    - If unsure, say "I don't have that" and offer the closest real option.

    Interaction style: Talk plainly. Route first, explain second.
  `;

  const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct"; // Powerful and free via HF Inference
  const HF_SEARCH_MODEL = "Qwen/Qwen2.5-7B-Instruct"; // Lighter model for search summarization

  const getHFToken = () => {
    try {
      const keys = JSON.parse(localStorage.getItem('arena_keys') || '{}');
      return keys['huggingface'] || '';
    } catch(e) { return ''; }
  };

  // --- MEMORY SYSTEM ---
  const MEMORY_KEY = 'polly_memory';
  const SEARCH_CACHE_KEY = 'polly_search_cache';

  function getMemory() {
    try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]'); } catch { return []; }
  }
  function saveMemory(entry) {
    const mem = getMemory();
    mem.push({ ...entry, timestamp: new Date().toISOString() });
    // Keep last 100 entries
    while (mem.length > 100) mem.shift();
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  }
  function getSearchCache() {
    try { return JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || '[]'); } catch { return []; }
  }
  function saveSearchResult(query, results) {
    const cache = getSearchCache();
    cache.push({ query, results, timestamp: new Date().toISOString() });
    while (cache.length > 50) cache.shift();
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  }
  function searchMemory(query) {
    const mem = getMemory();
    const q = query.toLowerCase();
    return mem.filter(m =>
      (m.query && m.query.toLowerCase().includes(q)) ||
      (m.response && m.response.toLowerCase().includes(q)) ||
      (m.topic && m.topic.toLowerCase().includes(q))
    ).slice(-5);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  async function backendFetch(path, options = {}) {
    if (!POLLY_BACKEND_HTTP) {
      throw new Error('Polly backend is not configured.');
    }
    const base = POLLY_BACKEND_HTTP.replace(/\/$/, '');
    const resp = await fetch(`${base}${path}`, options);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Backend ${resp.status}: ${text || resp.statusText}`);
    }
    return resp.json();
  }

  async function getBackendContext(force = false) {
    if (latestBackendContext && !force) return latestBackendContext;
    const data = await backendFetch('/v1/polly/context');
    latestBackendContext = data.context || null;
    backendCapabilities = data.capabilities || null;
    return data;
  }

  async function backendSearch(query) {
    return backendFetch('/v1/polly/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, include_local: true, include_web: true, limit: 5 }),
    });
  }

  async function backendDelegate(text) {
    return backendFetch('/v1/polly/delegate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        surface: context,
        page_url: window.location.href,
        page_title: document.title
      }),
    });
  }

  function renderContextCard(contextPayload) {
    const context = contextPayload?.context || contextPayload || {};
    const runs = context.latest_runs || [];
    const repos = context.repos || {};
    const counts = context.polly_pad?.counts || {};
    const summary = [
      `Generated: ${escapeHtml(context.generated_at || '')}`,
      `SCBE dirty: ${escapeHtml(repos.scbe?.dirty)}`,
      `Website dirty: ${escapeHtml(repos.website?.dirty)}`,
      `Polly Pad: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || 'n/a'}`,
      ...runs.slice(0, 2).map(run => `${run.kind} ${run.run_id} | growth=${run.growth} | upload=${run.upload}`)
    ];
    instantiateLab('Fresh Context', `<div style="font-size:12px;">${summary.map(line => escapeHtml(line)).join('<br>')}</div>`);
  }

  function renderSearchCard(searchPayload) {
    const result = searchPayload?.result || searchPayload || {};
    const localResults = result.local_results || [];
    const webResults = result.web_results || [];
    const lines = [];
    if (localResults.length) {
      lines.push(`<strong>Local</strong><br>${localResults.slice(0, 3).map(item => `${escapeHtml(item.title)}<br><span style="color:var(--polly-dim)">${escapeHtml(item.snippet || '')}</span>`).join('<br><br>')}`);
    }
    if (webResults.length) {
      lines.push(`<strong>Web</strong><br>${webResults.slice(0, 3).map(item => `${escapeHtml(item.title)}<br><span style="color:var(--polly-dim)">${escapeHtml(item.snippet || '')}</span>`).join('<br><br>')}`);
    }
    if (!lines.length) {
      lines.push('<span style="color:var(--polly-dim)">No search hits returned.</span>');
    }
    instantiateLab('Backend Search', `<div style="font-size:12px;">${lines.join('<br><br>')}</div>`);
  }

  function renderDelegationCard(delegationPayload) {
    const delegation = delegationPayload?.delegation || delegationPayload || {};
    const task = delegation.task || {};
    const assignments = delegation.assignments || [];
    instantiateLab(
      'Squad Delegation',
      `<div style="font-size:12px;">
        Mode: ${escapeHtml(delegation.mode || 'task')}<br>
        Task: ${escapeHtml(task.task_id || '')}<br>
        Trace: ${escapeHtml(task.trace_id || '')}<br>
        Assignments: ${assignments.map(item => `${escapeHtml(item.role)}=${escapeHtml(item.task)}`).join('<br>') || 'n/a'}
      </div>`
    );
  }

  // --- ROUND TABLE CONSENSUS ---
  const ROUND_TABLE_MODELS = [
    "Qwen/Qwen2.5-72B-Instruct",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "meta-llama/Meta-Llama-3.1-8B-Instruct",
  ];

  async function roundTableConsensus(question, token) {
    const votes = [];
    const prompt = `Answer concisely (max 100 words). Question: ${question}`;

    for (const model of ROUND_TABLE_MODELS) {
      try {
        const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { max_new_tokens: 200, temperature: 0.3 }
          })
        });
        const data = await resp.json();
        const text = data[0]?.generated_text || data?.error || "No response";
        votes.push({ model: model.split('/')[1], response: text.includes(question) ? text.split(question).pop().trim() : text });
      } catch(e) {
        votes.push({ model: model.split('/')[1], response: `[Error: ${e.message}]` });
      }
    }

    // Synthesize consensus
    const synthesis = `Round Table (${votes.length}/${ROUND_TABLE_MODELS.length} responded):\n\n` +
      votes.map((v, i) => `Council ${i+1} (${v.model}):\n${v.response.slice(0, 150)}`).join('\n\n');

    return synthesis;
  }

  // --- WEB SEARCH (via HF search or DuckDuckGo lite) ---
  async function webSearch(query) {
    // Check cache first
    const cached = getSearchCache().find(c => c.query.toLowerCase() === query.toLowerCase());
    if (cached && (Date.now() - new Date(cached.timestamp).getTime()) < 3600000) {
      return { results: cached.results, fromCache: true };
    }

    try {
      // Use DuckDuckGo lite (no API key needed)
      const resp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
      const data = await resp.json();

      const results = [];
      if (data.Abstract) results.push({ title: data.Heading, snippet: data.Abstract, url: data.AbstractURL });
      if (data.RelatedTopics) {
        data.RelatedTopics.slice(0, 5).forEach(t => {
          if (t.Text) results.push({ title: t.Text.slice(0, 60), snippet: t.Text, url: t.FirstURL });
        });
      }

      saveSearchResult(query, results);
      return { results, fromCache: false };
    } catch(e) {
      return { results: [{ title: "Search failed", snippet: e.message, url: "" }], fromCache: false };
    }
  }

  // --- UI CONSTRUCTION ---
  const launcher = document.createElement('button');
  launcher.className = 'polly-launcher';
  launcher.innerHTML = '<span class="polly-dot"></span><span>Polly</span>';

  const panel = document.createElement('aside');
  panel.className = 'polly-panel';
  panel.innerHTML = `
    <div class="polly-header">
      <div class="polly-kicker">Site Operator</div>
      <div class="polly-title">Polly</div>
    </div>
    <div class="polly-tabs">
      <div class="polly-tab active" data-tab="chat">Chat</div>
      <div class="polly-tab" data-tab="lab">Lab</div>
      <div class="polly-tab" data-tab="nav">Routes</div>
    </div>
    <div class="polly-content active" id="polly-chat">
      <div id="chat-history" style="height: 100%;">
        <div class="polly-chat-msg polly">
          <span class="name">Polly</span>
          Tell me what you want done. I will point you to the right tool, package, manual, support path, research note, or gated lane first.
        </div>
      </div>
    </div>
    <div class="polly-content" id="polly-lab">
      <div class="polly-kicker">Operations</div>
      <div class="polly-lab-item" style="border-color:var(--polly-accent); background:rgba(143,255,211,0.05);">
        <div id="lab-stats" style="font-weight:800; font-size:14px; margin-bottom:12px; color:var(--polly-accent);">Local Training Pairs: 0</div>
        <p style="font-size:12px; color:var(--polly-muted); margin-bottom:16px;">The sidebar can still collect local training pairs, but the full assistant page is the main front door for routing and product selection.</p>
        <button class="polly-btn" style="background:var(--polly-accent); color:var(--polly-bg); width:100%;" onclick="window.polly.exportTraining()">Download Training Pack (.JSONL)</button>
      </div>
      <div class="polly-kicker">Primary Paths</div>
      <div id="lab-workspace">
        <p class="polly-copy">Start with the full assistant surface when you want the site to act like a shopkeeper. Open tools directly only when you already know the action lane.</p>
        <div class="polly-lab-item">
          <strong>Open the assistant front door</strong>
          <p style="font-size:12px; color:var(--polly-dim);">Use the full page to route buyers, operators, and curious visitors into the right lane.</p>
          <a class="polly-btn" href="${root}/assistant.html">Open Assistant</a>
        </div>
      </div>
    </div>
    <div class="polly-content" id="polly-nav">
      <div class="polly-link-grid">
        <a class="polly-link" href="${root}/assistant.html"><strong>Assistant</strong><span>Front door & product routing</span></a>
        <a class="polly-link" href="${root}/tools.html"><strong>Tools</strong><span>Live action surfaces</span></a>
        <a class="polly-link" href="${root}/support.html"><strong>Support</strong><span>Recovery & troubleshooting</span></a>
        <a class="polly-link" href="${root}/product-manual/index.html"><strong>Manuals</strong><span>Buyer setup & delivery</span></a>
        <a class="polly-link" href="${root}/research/index.html"><strong>Research</strong><span>Proof & benchmarks</span></a>
        <a class="polly-link" href="${root}/book.html"><strong>Book</strong><span>Story as memory</span></a>
        <a class="polly-link" href="${root}/arena.html"><strong>Arena</strong><span>Model comparison sandbox</span></a>
      </div>
    </div>
    <div class="polly-input-area">
      <input type="text" class="polly-input" id="polly-input" placeholder="Ask Polly where to start, what to buy, or what to fix...">
      <button class="polly-send" id="polly-send">➔</button>
    </div>
  `;

  // --- LOGIC ---
  const state = { history: [], currentTab: 'chat', trustLevel: 1, trainingLogs: [] };

  const TRUST_DB = {
    green: ['github.com','arxiv.org','wikipedia.org','huggingface.co','notion.so'],
    yellow: ['reddit.com','twitter.com','x.com','medium.com','substack.com']
  };

  function logTraining(user, polly, meta) {
    state.trainingLogs.push({
      instruction: "You are Polly, the route-first operator for the SCBE-AETHERMOORE website.",
      input: user,
      output: polly,
      metadata: {
        timestamp: new Date().toISOString(),
        trust_tier: state.trustLevel,
        ...meta
      }
    });
    updateLabStats();
  }

  function exportTrainingData() {
    if(state.trainingLogs.length === 0) {
      alert("No training data generated yet. Talk to Polly first!");
      return;
    }
    const blob = new Blob([state.trainingLogs.map(l => JSON.stringify(l)).join('\n')], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scbe_training_pack_${new Date().getTime()}.jsonl`;
    a.click();
  }

  function updateLabStats() {
    const stats = document.getElementById('lab-stats');
    if(stats) stats.innerText = `Local Training Pairs: ${state.trainingLogs.length}`;
  }

  function classify(url) {
    const domain = url.split('/')[2] || '';
    if(TRUST_DB.green.some(d => domain.includes(d))) return 'GREEN';
    if(TRUST_DB.yellow.some(d => domain.includes(d))) return 'YELLOW';
    return 'RED';
  }
let LORE_MAP = null;
async function fetchLore() {
  if(LORE_MAP) return;
  try {
    const resp = await fetch(`${root}/static/lore_map.json`);
    LORE_MAP = await resp.json();
  } catch(e) { console.error("Failed to load Lore Map"); }
}

  async function callPolly(text) {
  if (POLLY_BACKEND_HTTP) {
    try {
      const resp = await fetch(`${POLLY_BACKEND_HTTP.replace(/\/$/, '')}/v1/polly/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          surface: context,
          page_url: window.location.href,
          page_title: document.title
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        const backendResponse = data.text || "Polly backend responded without text.";
        if (data.context) {
          latestBackendContext = data.context;
        }
        if (data.search) {
          renderSearchCard(data.search);
        }
        if (data.delegation) {
          renderDelegationCard(data.delegation);
        }
        if (data.context && (text.toLowerCase().includes('status') || text.toLowerCase().includes('latest') || text.toLowerCase().includes('context'))) {
          renderContextCard(data.context);
        }
        logTraining(text, backendResponse, { tool_use: 'backend', intent: data.intent || 'unknown' });
        if (data.task?.task_id) {
          instantiateLab('Backend Task', `<div style="font-size:12px;">Task: ${data.task.task_id}<br>Trace: ${data.task.trace_id}<br>Intent: ${data.task.intent}</div>`);
        }
        return backendResponse;
      }
    } catch (e) {
      console.warn('Polly backend unavailable, falling back to browser mode.', e);
    }
  }

  const token = getHFToken();
  const query = text.toLowerCase();

  // Lazy-Mode Lore Lookup
  await fetchLore();
  if(LORE_MAP) {
    for(const [k, v] of Object.entries(LORE_MAP.tongues)) { if(query.includes(k.toLowerCase())) return `[STATIC LORE] ${v}`; }
    for(const [k, v] of Object.entries(LORE_MAP.concepts)) { if(query.includes(k.toLowerCase())) return `[STATIC LORE] ${v}`; }
    for(const [k, v] of Object.entries(LORE_MAP.characters)) { if(query.includes(k.toLowerCase())) return `[STATIC LORE] ${v}`; }
  }

  if(!token) return "I'm running in 'Lore Only' mode because I don't have a token. I can still tell you about the Tongues and Marcus, but for 'AetherBrowse' or deep math, I'll need that Hugging Face fuel!";

  let response = "";
    let meta = { tool_use: 'none' };

    // Round Table mode
    if(text.toLowerCase().includes("round table") || text.toLowerCase().includes("consensus") || text.toLowerCase().includes("council")) {
      addMsg('Polly', "Convening the Round Table... querying 3 AI council members.", 'polly');
      response = await roundTableConsensus(text.replace(/round table|consensus|council/gi, '').trim(), token);
      meta.tool_use = 'round_table';
      saveMemory({ type: 'round_table', query: text, response, topic: 'consensus' });
    }
    // Web Search detection
    else if(text.toLowerCase().includes("search") || text.toLowerCase().includes("browse") || text.toLowerCase().includes("look up") || text.toLowerCase().includes("find info")) {
      addMsg('Polly', "Searching... classifying results through 14-layer trust.", 'polly');
      const searchQuery = text.replace(/search|browse|look up|find info/gi, '').trim();
      const { results, fromCache } = await webSearch(searchQuery);

      if (results.length > 0) {
        response = (fromCache ? "[Cached] " : "") + "Search results:\n\n";
        results.forEach(r => {
          const trust = classify(r.url || '');
          const icon = trust === 'GREEN' ? '✅' : trust === 'YELLOW' ? '⚠️' : '🚫';
          response += `${icon} [${trust}] ${r.title}\n  ${r.snippet?.slice(0, 120) || ''}\n  ${r.url}\n\n`;
        });
        instantiateLab('Web Search', `<div style="font-size:12px;">Query: "${searchQuery}"<br>Results: ${results.length}<br>${fromCache ? 'From cache' : 'Fresh search'}</div>`);
      } else {
        response = "No results found. Try a different query.";
      }
      meta.tool_use = 'web_search';
      saveMemory({ type: 'search', query: searchQuery, response, topic: searchQuery.split(' ')[0] });
    }
    // Memory recall
    else if(text.toLowerCase().includes("remember") || text.toLowerCase().includes("recall") || text.toLowerCase().includes("what did")) {
      const memories = searchMemory(text.replace(/remember|recall|what did/gi, '').trim());
      if (memories.length > 0) {
        response = "From my memory:\n\n" + memories.map(m =>
          `[${m.timestamp?.slice(0, 10)}] ${m.type}: ${(m.query || m.topic || '').slice(0, 50)}\n  ${(m.response || '').slice(0, 100)}`
        ).join('\n\n');
      } else {
        response = "I don't have memories matching that. Talk to me more and I'll remember!";
      }
      meta.tool_use = 'memory_recall';
    }
    // Thinking mode
    else if(text.toLowerCase().includes("think about") || text.toLowerCase().includes("analyze") || text.toLowerCase().includes("deep think")) {
      addMsg('Polly', "Entering analysis mode. I will route the request first, then inspect it carefully.", 'polly');
      // First search memory for context
      const context = searchMemory(text).map(m => m.response?.slice(0, 100)).join('\n');
      const thinkPrompt = `<|im_start|>system\n${POLLY_LORE}\nYou are in DEEP THINKING mode. Analyze step by step. First pick the correct site lane or commercial boundary, then explain the reasoning clearly.\nContext from memory:\n${context}\n<|im_end|>\n<|im_start|>user\n${text}\n<|im_end|>\n<|im_start|>assistant\nLet me route this first, then think through it carefully:\n`;
      try {
        const resp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: thinkPrompt, parameters: { max_new_tokens: 1024, temperature: 0.4 } })
        });
        const data = await resp.json();
        response = data[0]?.generated_text || "Thinking failed.";
        if(response.includes("assistant\n")) response = response.split("assistant\n").pop();
      } catch(e) { response = `Thinking error: ${e.message}`; }
      meta.tool_use = 'thinking';
      saveMemory({ type: 'thinking', query: text, response: response.slice(0, 200), topic: 'analysis' });
    }
    // Training data generation from conversation
    else if(text.toLowerCase().includes("train") || text.toLowerCase().includes("learn this")) {
      const mem = getMemory();
      const searchCache = getSearchCache();
      const trainingData = [
        ...mem.map(m => ({ instruction: "You are Polly.", input: m.query || '', output: m.response || '' })),
        ...searchCache.map(s => ({ instruction: "Search and classify results.", input: s.query, output: JSON.stringify(s.results?.slice(0, 3)) }))
      ];
      response = `Training data ready: ${trainingData.length} pairs from memory + ${searchCache.length} search results.\n\n` +
        `Compatible formats:\n- SFT JSONL (download via Lab tab)\n- SCBE kernel pipeline (upload to issdandavis/polly-training-data on HF)\n- QLoRA config: ~/SCBE-AETHERMOORE/training/hydra_multi_model_config.yaml\n\n` +
        `Use the Lab tab to export, or say "export training" to download now.`;
      // Add search cache to training logs
      searchCache.forEach(s => {
        state.trainingLogs.push({
          instruction: "You are Polly. Search the web and classify results using SCBE trust tiers.",
          input: s.query,
          output: JSON.stringify(s.results?.slice(0, 3)),
          metadata: { timestamp: s.timestamp, trust_tier: 1, tool_use: 'search_to_training' }
        });
      });
      updateLabStats();
      meta.tool_use = 'training_prep';
    }
    else {
      try {
        const resp = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            inputs: `<|im_start|>system\n${POLLY_LORE}\n<|im_end|>\n<|im_start|>user\n${text}\n<|im_end|>\n<|im_start|>assistant\n`,
            parameters: { max_new_tokens: 512, temperature: 0.7 }
          })
        });
        const data = await resp.json();
        response = data[0]?.generated_text || "My spectral coherence is wavering. Try again?";
        if(response.includes("assistant\n")) response = response.split("assistant\n")[1];
      } catch(e) {
        response = `[ERROR] My RU layer blocked that request: ${e.message}`;
      }
    }

    logTraining(text, response, meta);
    return response;
  }

  async function performSovereignSearch(query) {
    // In a production env, this would call your backend AetherBrowse service.
    // For this demo, we simulate the SCBE classification of 'real-time' results.
    const mockResults = [
      { url: "https://arxiv.org/abs/2604.0404", title: "Hyperbolic Scaling in AI Security" },
      { url: "https://x.com/tech_leak", title: "New Prompt Injection Found" },
      { url: "https://malware.biz/jailbreak", title: "Free AI Tokens" }
    ];

    let response = "Search complete. Here are the AetherBrowse results:\n\n";
    mockResults.forEach(r => {
      const t = classify(r.url);
      const icon = t === 'GREEN' ? '✅' : t === 'YELLOW' ? '⚠️' : '🚫';
      response += `${icon} [${t}] ${r.title}\n   ${r.url}\n\n`;
    });
    
    instantiateLab('AetherBrowse Swarm', `<div style="font-size:12px;">Query: "${query}"<br>Layers: 1-14 Active<br>Result: 3 nodes found.</div>`);
    return response;
  }

  function addMsg(name, text, type) {
    const chat = document.getElementById('chat-history');
    const msg = document.createElement('div');
    msg.className = `polly-chat-msg ${type}`;
    msg.innerHTML = `<span class="name">${name}</span>${text}`;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  async function handleSend() {
    const input = document.getElementById('polly-input');
    const text = input.value.trim();
    if(!text) return;
    
    input.value = '';
    addMsg('You', text, 'user');
    
    const response = await callPolly(text);
    addMsg('Polly', response, 'polly');

    // Simple Tool Call detection
    if(text.toLowerCase().includes("rwp") || text.toLowerCase().includes("packet")) {
      instantiateLab('RWP Packet', `<pre>RWP1|tongue=KO|codec=spelltext|aad=polly_lab\npayload=MANIFEST<type>object</type><ts>${new Date().toISOString()}</ts>\nsig_DR=dr:hatch'f3a2b1'vara'esh</pre>`);
    }
  }

  function instantiateLab(title, content) {
    const ws = document.getElementById('lab-workspace');
    const item = document.createElement('div');
    item.className = 'polly-lab-item';
    item.innerHTML = `<strong>${title}</strong><div style="margin-top:8px;">${content}</div>`;
    ws.prepend(item);
    switchTab('lab');
  }

  function switchTab(tabId) {
    document.querySelectorAll('.polly-tab, .polly-content').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(`polly-${tabId}`).classList.add('active');
    state.currentTab = tabId;
  }

  // --- EVENTS ---
  launcher.addEventListener('click', () => panel.classList.toggle('open'));
  
  panel.querySelectorAll('.polly-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('polly-send').addEventListener('click', handleSend);
  document.getElementById('polly-input').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') handleSend();
  });

  // Export for tools
  window.polly = {
    startTrial: () => {
      addMsg('Polly', "Resonance Trial initiated. Match the frequencies to stabilize the KO sphere. (Game logic loading...)", 'polly');
      instantiateLab('Resonance Trial v1', '<div style="background:var(--polly-gold); height:4px; width:60%; border-radius:2px; margin:10px 0;"></div><p style="font-size:12px;">Frequency: 440Hz (KO) - Status: DESYNC</p>');
    },
    exportTraining: exportTrainingData,
    refreshContext: async () => {
      const data = await getBackendContext(true);
      renderContextCard(data);
      return data;
    },
    search: async (query) => {
      const data = await backendSearch(query);
      renderSearchCard(data);
      return data;
    },
    delegateTask: async (text) => {
      const data = await backendDelegate(text);
      renderDelegationCard(data);
      return data;
    }
  };

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  if (POLLY_BACKEND_HTTP) {
    getBackendContext(false).catch(() => {});
  }
})();
