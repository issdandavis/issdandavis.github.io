(() => {
  const state = {
    routing: null,
    catalog: null,
    backendOnline: false,
    history: [],
    packetUrl: null
  };

  const els = {
    history: document.getElementById('assistant-history'),
    form: document.getElementById('assistant-form'),
    input: document.getElementById('assistant-input'),
    lanes: document.getElementById('assistant-lanes'),
    status: document.getElementById('assistant-status'),
    recommendation: document.getElementById('assistant-recommendation'),
    packet: document.getElementById('assistant-packet'),
    packetCopy: document.getElementById('assistant-packet-copy'),
    packetDownload: document.getElementById('assistant-packet-download'),
    publicProducts: document.getElementById('public-products'),
    customBuckets: document.getElementById('custom-buckets'),
    restrictedBuckets: document.getElementById('restricted-buckets')
  };

  const BACKEND = window.__POLLY_BACKEND_HTTP__ || '';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function normalize(value) {
    return String(value || '').toLowerCase();
  }

  function includesKeyword(text, keywords) {
    const normalized = normalize(text);
    return (keywords || []).some((keyword) => normalized.includes(normalize(keyword)));
  }

  function addMessage(kind, title, body) {
    const item = document.createElement('article');
    item.className = `assistant-message ${kind}`;
    item.innerHTML = `
      <div class="assistant-message-label">${escapeHtml(title)}</div>
      <div class="assistant-message-body">${body}</div>
    `;
    els.history.appendChild(item);
    els.history.scrollTop = els.history.scrollHeight;
  }

  function setStatus(label, detail, tone) {
    els.status.className = `status-card ${tone || 'neutral'}`;
    els.status.innerHTML = `
      <div class="status-label">${escapeHtml(label)}</div>
      <div class="status-detail">${escapeHtml(detail)}</div>
    `;
  }

  function renderCardGrid(container, items, buildCard) {
    container.innerHTML = items.map(buildCard).join('');
  }

  function buildSurfaceCard(surface) {
    return `
      <article class="lane-card">
        <div class="lane-name">${escapeHtml(surface.name)}</div>
        <p>${escapeHtml(surface.purpose)}</p>
        <a href="${escapeHtml(surface.url)}">Open ${escapeHtml(surface.name)} &rarr;</a>
      </article>
    `;
  }

  function buildProductCard(item) {
    return `
      <article class="catalog-card">
        <div class="catalog-type">${escapeHtml(item.type)}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="catalog-actions">
          ${item.manual_url ? `<a href="${escapeHtml(item.manual_url)}">Manual</a>` : ''}
          ${item.buy_url ? `<a href="${escapeHtml(item.buy_url)}" target="_blank" rel="noopener">Buy</a>` : ''}
          ${item.contact_url ? `<a href="${escapeHtml(item.contact_url)}">Ask about this</a>` : ''}
        </div>
      </article>
    `;
  }

  function buildCustomCard(item) {
    const includes = (item.includes || []).map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
    return `
      <article class="catalog-card">
        <div class="catalog-type">${escapeHtml(item.type)}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <ul class="catalog-list">${includes}</ul>
        <div class="catalog-actions">
          <a href="${escapeHtml(item.contact_url)}">Start this conversation</a>
        </div>
      </article>
    `;
  }

  function buildRestrictedCard(item) {
    return `
      <article class="catalog-card restricted">
        <div class="catalog-type">${escapeHtml(item.type)}</div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <p class="catalog-boundary">${escapeHtml(item.boundary)}</p>
        <div class="catalog-actions">
          <a href="${escapeHtml(item.contact_url)}">Request gated review</a>
        </div>
      </article>
    `;
  }

  function getSurfaceForRoute(route) {
    if (!route || !state.routing) return null;
    return (state.routing.surfaces || []).find((surface) => surface.url === route.target) || null;
  }

  function classifyMessage(text) {
    const catalog = state.catalog || {};
    const restricted = (catalog.restricted_buckets || []).find((item) => includesKeyword(text, item.keywords));
    if (restricted) {
      return { kind: 'restricted', item: restricted };
    }

    const custom = (catalog.custom_buckets || []).find((item) => includesKeyword(text, item.keywords));
    if (custom) {
      return { kind: 'custom', item: custom };
    }

    const product = (catalog.public_products || []).find((item) => includesKeyword(text, item.keywords));
    if (product) {
      return { kind: 'product', item: product };
    }

    const route = (state.routing?.routes || []).find((item) => includesKeyword(text, item.keywords));
    if (route) {
      return { kind: 'route', item: route, surface: getSurfaceForRoute(route) };
    }

    return {
      kind: 'route',
      item: null,
      surface: (state.routing?.surfaces || []).find((surface) => surface.name === 'assistant') || null
    };
  }

  function renderRecommendation(result) {
    if (result.kind === 'restricted') {
      els.recommendation.innerHTML = `
        <div class="recommendation-label">Gated lane</div>
        <h3>${escapeHtml(result.item.name)}</h3>
        <p>${escapeHtml(result.item.description)}</p>
        <p class="catalog-boundary">${escapeHtml(result.item.boundary)}</p>
        <a class="recommendation-link" href="${escapeHtml(result.item.contact_url)}">Request gated review &rarr;</a>
      `;
      return;
    }

    if (result.kind === 'custom') {
      els.recommendation.innerHTML = `
        <div class="recommendation-label">Custom build lane</div>
        <h3>${escapeHtml(result.item.name)}</h3>
        <p>${escapeHtml(result.item.description)}</p>
        <a class="recommendation-link" href="${escapeHtml(result.item.contact_url)}">Start this conversation &rarr;</a>
      `;
      return;
    }

    if (result.kind === 'product') {
      els.recommendation.innerHTML = `
        <div class="recommendation-label">Public package</div>
        <h3>${escapeHtml(result.item.name)}</h3>
        <p>${escapeHtml(result.item.description)}</p>
        <div class="recommendation-actions">
          <a class="recommendation-link" href="${escapeHtml(result.item.manual_url)}">Read the manual &rarr;</a>
          <a class="recommendation-link" href="${escapeHtml(result.item.buy_url)}" target="_blank" rel="noopener">Open checkout &rarr;</a>
        </div>
      `;
      return;
    }

    const surface = result.surface;
    if (surface) {
      els.recommendation.innerHTML = `
        <div class="recommendation-label">Primary route</div>
        <h3>${escapeHtml(surface.name)}</h3>
        <p>${escapeHtml(surface.purpose)}</p>
        <a class="recommendation-link" href="${escapeHtml(surface.url)}">Open ${escapeHtml(surface.name)} &rarr;</a>
      `;
      return;
    }

    els.recommendation.innerHTML = `
      <div class="recommendation-label">Primary route</div>
      <h3>Assistant</h3>
      <p>Start with routing, then move into tools, manuals, support, research, or the book.</p>
    `;
  }

  function summarizeResult(result) {
    if (result.kind === 'restricted') {
      return `Gated intake for ${result.item.name}.`;
    }

    if (result.kind === 'custom') {
      return `Public custom build request routed to ${result.item.name}.`;
    }

    if (result.kind === 'product') {
      return `Public package match: ${result.item.name}.`;
    }

    if (result.surface) {
      return `Route to ${result.surface.name}.`;
    }

    return 'Route to assistant intake.';
  }

  function targetForResult(result) {
    if (result.kind === 'restricted') {
      return {
        surface: 'gated_intake',
        url: result.item.contact_url || window.location.href
      };
    }

    if (result.kind === 'custom') {
      return {
        surface: 'assistant',
        url: result.item.contact_url || 'https://aethermoore.com/assistant.html'
      };
    }

    if (result.kind === 'product') {
      return {
        surface: 'manuals',
        url: result.item.manual_url || 'https://aethermoore.com/product-manual/index.html'
      };
    }

    if (result.surface) {
      return {
        surface: result.surface.name,
        url: result.surface.url
      };
    }

    return {
      surface: 'assistant',
      url: 'https://aethermoore.com/assistant.html'
    };
  }

  function repoTargetsForResult(result) {
    const website = {
      name: 'website',
      repo: 'issdandavis.github.io',
      reason: 'Primary public site surface, assistant UI, manuals, support, and search-facing pages.'
    };

    const controlPlane = {
      name: 'control_plane',
      repo: 'SCBE-AETHERMOORE',
      reason: 'Automation, publishing, training, and workflow orchestration.'
    };

    if (result.kind === 'restricted') {
      return [];
    }

    if (result.kind === 'custom') {
      return [website, controlPlane];
    }

    if (result.kind === 'product') {
      return [website];
    }

    switch (result.surface?.name) {
      case 'manuals':
      case 'research':
        return [website, controlPlane];
      case 'assistant':
      case 'tools':
      case 'support':
      case 'book':
      default:
        return [website];
    }
  }

  function nextStepForResult(result, target) {
    if (result.kind === 'restricted') {
      return 'Stop at intake. Confirm the gated boundary and move the request into a protected review path instead of exposing internal workflow details on the public site.';
    }

    if (result.kind === 'custom') {
      return 'Open the website repo first, preserve the assistant-first model, and scope the public-facing build before widening into control-plane automation.';
    }

    if (result.kind === 'product') {
      return 'Open the manual path first, verify whether the public package already fits, and only turn it into a custom build if the manual does not cover the need.';
    }

    return `Open ${target.surface || 'assistant'} first and make the smallest change that improves the routed user path.`;
  }

  function buildTaskPacket(text, result) {
    const target = targetForResult(result);
    const repoTargets = repoTargetsForResult(result);

    return {
      packet_version: '2026-04-11',
      packet_type: 'scbe_operator_handoff',
      created_at: new Date().toISOString(),
      source: {
        site: 'https://aethermoore.com',
        surface: 'assistant',
        url: window.location.href
      },
      request: {
        text,
        lane: result.kind === 'route' ? 'route' : result.kind,
        intent: result.item?.intent || 'start_here',
        summary: summarizeResult(result)
      },
      routing: {
        target_surface: target.surface,
        target_url: target.url
      },
      execution: {
        visibility: result.kind === 'restricted' ? 'gated' : 'public',
        preferred_operator: result.kind === 'restricted' ? ['human_review'] : ['cursor', 'codex'],
        repo_targets: repoTargets,
        needs_human_review: result.kind === 'restricted' || result.kind === 'custom'
      },
      context: {
        routing_map: 'https://aethermoore.com/assistant-routing.json',
        catalog: 'https://aethermoore.com/assistant-catalog.json',
        llms: 'https://aethermoore.com/llms.txt'
      },
      next_step: nextStepForResult(result, target)
    };
  }

  function renderTaskPacket(packet) {
    const formatted = JSON.stringify(packet, null, 2);
    els.packet.textContent = formatted;

    if (state.packetUrl) {
      URL.revokeObjectURL(state.packetUrl);
    }

    state.packetUrl = URL.createObjectURL(
      new Blob([formatted], { type: 'application/json' })
    );

    els.packetDownload.href = state.packetUrl;
    els.packetDownload.download = `scbe-task-packet-${Date.now()}.json`;
  }

  function deterministicReply(result) {
    if (result.kind === 'restricted') {
      return `
        <p>This request falls into a gated lane.</p>
        <p>The public assistant can point to the intake path, but it should not expose protected workflows, proprietary material, or high-assurance details here.</p>
      `;
    }

    if (result.kind === 'custom') {
      return `
        <p>I would route this into <strong>${escapeHtml(result.item.name)}</strong>.</p>
        <p>${escapeHtml(result.item.description)}</p>
        <p>Use the contact path on the right to turn it into a scoped public-facing build.</p>
      `;
    }

    if (result.kind === 'product') {
      return `
        <p>The closest public package is <strong>${escapeHtml(result.item.name)}</strong>.</p>
        <p>${escapeHtml(result.item.description)}</p>
        <p>Open the manual first, then decide whether the package already covers the need or whether it should become a custom build.</p>
      `;
    }

    if (result.surface) {
      return `
        <p>The shortest route is <strong>${escapeHtml(result.surface.name)}</strong>.</p>
        <p>${escapeHtml(result.surface.purpose)}</p>
      `;
    }

    return `
      <p>I can route you into the right surface, package, or support path.</p>
      <p>Try describing the job, the problem, or the product you want to build.</p>
    `;
  }

  async function callBackend(text) {
    if (!BACKEND) return null;

    try {
      const response = await fetch(`${BACKEND.replace(/\/$/, '')}/v1/polly/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          surface: 'assistant',
          page_url: window.location.href,
          page_title: document.title
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      state.backendOnline = true;
      return data.text || null;
    } catch (error) {
      state.backendOnline = false;
      return null;
    }
  }

  async function refreshBackendStatus() {
    if (!BACKEND) {
      setStatus('Local routing only', 'No Polly backend configured for this page.', 'neutral');
      return;
    }

    try {
      const response = await fetch(`${BACKEND.replace(/\/$/, '')}/v1/polly/context`);
      if (!response.ok) throw new Error('offline');
      state.backendOnline = true;
      setStatus('Backend online', 'Route-first assistant plus live Polly backend.', 'good');
    } catch (error) {
      state.backendOnline = false;
      setStatus('Local routing only', 'Backend unavailable, deterministic routing still works.', 'neutral');
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;

    els.input.value = '';
    addMessage('user', 'You', `<p>${escapeHtml(text)}</p>`);

    const classification = classifyMessage(text);
    renderTaskPacket(buildTaskPacket(text, classification));
    renderRecommendation(classification);
    addMessage('assistant', 'Polly', deterministicReply(classification));

    if (classification.kind === 'restricted') return;

    const backendReply = await callBackend(text);
    if (backendReply) {
      addMessage('assistant', 'Polly backend', `<p>${escapeHtml(backendReply)}</p>`);
      setStatus('Backend online', 'Route-first assistant plus live Polly backend.', 'good');
    } else if (BACKEND) {
      setStatus('Local routing only', 'Backend unavailable, deterministic routing still works.', 'neutral');
    }
  }

  function bindQuickActions() {
    document.querySelectorAll('[data-assistant-prompt]').forEach((button) => {
      button.addEventListener('click', () => {
        els.input.value = button.dataset.assistantPrompt || '';
        els.input.focus();
      });
    });
  }

  async function copyTaskPacket() {
    try {
      await navigator.clipboard.writeText(els.packet.textContent);
      const original = els.packetCopy.textContent;
      els.packetCopy.textContent = 'Copied';
      window.setTimeout(() => {
        els.packetCopy.textContent = original;
      }, 1200);
    } catch (error) {
      const original = els.packetCopy.textContent;
      els.packetCopy.textContent = 'Copy failed';
      window.setTimeout(() => {
        els.packetCopy.textContent = original;
      }, 1200);
    }
  }

  async function init() {
    const [routing, catalog] = await Promise.all([
      fetch('./assistant-routing.json').then((response) => response.json()),
      fetch('./assistant-catalog.json').then((response) => response.json())
    ]);

    state.routing = routing;
    state.catalog = catalog;

    renderCardGrid(els.lanes, routing.surfaces || [], buildSurfaceCard);
    renderCardGrid(els.publicProducts, catalog.public_products || [], buildProductCard);
    renderCardGrid(els.customBuckets, catalog.custom_buckets || [], buildCustomCard);
    renderCardGrid(els.restrictedBuckets, catalog.restricted_buckets || [], buildRestrictedCard);

    renderRecommendation({
      kind: 'route',
      surface: (routing.surfaces || []).find((surface) => surface.name === 'assistant')
    });

    renderTaskPacket(
      buildTaskPacket(
        'Help me choose the right lane.',
        {
          kind: 'route',
          item: { intent: 'start_here' },
          surface: (routing.surfaces || []).find((surface) => surface.name === 'assistant')
        }
      )
    );

    addMessage(
      'assistant',
      'Polly',
      `
        <p>I am the front desk for SCBE-AETHERMOORE.</p>
        <p>I route you into the right surface, the right public package, or the right support path before I ask the system to think harder.</p>
      `
    );

    bindQuickActions();
    els.packetCopy.addEventListener('click', copyTaskPacket);
    els.form.addEventListener('submit', handleSubmit);
    refreshBackendStatus();
  }

  init().catch((error) => {
    setStatus('Assistant offline', 'The page failed to load its route map.', 'bad');
    addMessage('assistant', 'Polly', `<p>${escapeHtml(error.message)}</p>`);
  });
})();
