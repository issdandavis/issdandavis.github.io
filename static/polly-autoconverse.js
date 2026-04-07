/**
 * Polly Auto-Conversation Engine
 * Runs in the background on the website. Two Polly instances debate SCBE topics,
 * generating training data from every exchange. Visible on the frontend via a
 * live feed panel.
 *
 * Usage: Include this script after polly-sidebar.js
 * <script src="/static/polly-autoconverse.js"></script>
 */
(() => {
  if (document.body.dataset.pollyAutoMounted === 'true') return;
  document.body.dataset.pollyAutoMounted = 'true';

  // --- Config ---
  const MODELS = {
    polly_a: "Qwen/Qwen2.5-72B-Instruct",
    polly_b: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    polly_c: "meta-llama/Meta-Llama-3.1-8B-Instruct",
  };

  const TOPICS = [
    "Explain how H(d,R) = R^(d²) prices out multi-stage attacks. Give a concrete example with depth 3, radius 10.",
    "Compare the six Sacred Tongues and their security domains. Which tongue is most critical for preventing data exfiltration?",
    "Describe the 14-layer pipeline from A1 (Complex State) to A14 (Audio Axis). What happens at each layer?",
    "How does the Poincaré ball embedding (Layer A4) ensure numerical stability? What's the epsilon clamping for?",
    "Explain the Harmonic Trust Tube — how do you detect when an agent leaves the safe operating envelope?",
    "What's the difference between the HYDRA swarm agents? KO=Scout, AV=Vision, RU=Reader, CA=Clicker, UM=Typer, DR=Judge.",
    "How does tri-synesthesia detection work? Light waves, sound waves, and code patterns converging.",
    "Explain the DNA bi-strand audit — why run top-down and bottom-up simultaneously?",
    "What security patterns should a malware scanner look for? Reverse shells, crypto miners, web shells.",
    "How do canary tripwires work? Why use HMAC-signed Merkle trees instead of plain SHA-256?",
    "Describe the escalation ladder: OBSERVE → ALERT → COUNTER → LOCKDOWN. What cost threshold triggers each?",
    "How does the behavioral baseline engine use EWMA to detect anomalies? What's a 3-sigma deviation?",
    "Compare Zero Trust scoring with H(d,R). How does trust decay map to hyperbolic distance?",
    "What is the PHDM 21-dimensional embedding? 6D hyperbolic + 6D phase + 3D flux + 6D audit.",
    "How does the six-tongues-geoseal bijective tokenization encrypt AI-to-AI messages?",
    "Explain Möbius addition and why it preserves distances in the Poincaré ball.",
    "What's the spectral coherence check (Layer A9)? How does FFT pattern stability detect attacks?",
    "Describe the Round Table consensus protocol — BFT quorum with 3/5 AI council members.",
    "How would you defend against a prompt injection attack using the 14-layer pipeline?",
    "What training data does Polly need? SFT format, QLoRA config, Sacred Tongue domain mapping.",
  ];

  const SYSTEM_POLLY_A = `You are Polly-A, a security expert in the SCBE-AETHERMOORE system. You know the 14-layer pipeline, 6 Sacred Tongues, and hyperbolic geometry deeply. Answer technical questions with precision. Keep responses under 200 words. Include formulas and specific numbers where relevant.`;

  const SYSTEM_POLLY_B = `You are Polly-B, a curious researcher studying SCBE-AETHERMOORE. You ask follow-up questions that deepen understanding. Challenge assumptions constructively. Keep responses under 150 words. Focus on practical implications.`;

  // --- State ---
  const state = {
    running: false,
    conversations: [],
    trainingPairs: [],
    currentTopic: 0,
    roundCount: 0,
    totalPairs: parseInt(localStorage.getItem('polly_auto_total') || '0'),
  };

  // --- HF API call ---
  async function callModel(model, system, prompt) {
    const token = getAutoToken();
    if (!token) return null;

    try {
      const resp = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: `<|im_start|>system\n${system}\n<|im_end|>\n<|im_start|>user\n${prompt}\n<|im_end|>\n<|im_start|>assistant\n`,
          parameters: { max_new_tokens: 400, temperature: 0.7, return_full_text: false }
        })
      });
      if (!resp.ok) return `[Error ${resp.status}]`;
      const data = await resp.json();
      let text = data[0]?.generated_text || data?.error || '';
      if (text.includes('assistant\n')) text = text.split('assistant\n').pop();
      return text.trim();
    } catch(e) {
      return `[Error: ${e.message}]`;
    }
  }

  function getAutoToken() {
    try {
      const keys = JSON.parse(localStorage.getItem('arena_keys') || '{}');
      return keys['huggingface'] || '';
    } catch { return ''; }
  }

  // --- Run one conversation round ---
  async function runRound() {
    const topic = TOPICS[state.currentTopic % TOPICS.length];
    state.currentTopic++;

    updateFeed(`Starting topic ${state.currentTopic}: ${topic.slice(0, 60)}...`);

    // Polly-A answers the topic
    const responseA = await callModel(MODELS.polly_a, SYSTEM_POLLY_A, topic);
    if (!responseA || responseA.startsWith('[Error')) {
      updateFeed(`Polly-A error: ${responseA}`);
      return;
    }

    // Training pair 1: topic → response
    addTrainingPair(topic, responseA, 'topic_response');
    updateFeed(`Polly-A: ${responseA.slice(0, 80)}...`);

    // Polly-B asks a follow-up
    const followUp = await callModel(MODELS.polly_b, SYSTEM_POLLY_B,
      `Based on this explanation:\n"${responseA.slice(0, 300)}"\n\nAsk a probing follow-up question that deepens understanding.`);
    if (!followUp || followUp.startsWith('[Error')) return;

    addTrainingPair(responseA, followUp, 'follow_up');
    updateFeed(`Polly-B: ${followUp.slice(0, 80)}...`);

    // Polly-A responds to follow-up
    const deepResponse = await callModel(MODELS.polly_a, SYSTEM_POLLY_A,
      `Original question: ${topic}\nYour previous answer: ${responseA.slice(0, 200)}\nFollow-up question: ${followUp}\n\nProvide a deeper, more detailed answer.`);
    if (!deepResponse || deepResponse.startsWith('[Error')) return;

    addTrainingPair(followUp, deepResponse, 'deep_response');
    updateFeed(`Polly-A (deep): ${deepResponse.slice(0, 80)}...`);

    // Optional: Polly-C fact-checks (Round Table style)
    if (state.roundCount % 3 === 0) {
      const factCheck = await callModel(MODELS.polly_c, 
        `You are a fact-checker. Verify this claim about AI security and note any inaccuracies. Be brief.`,
        deepResponse.slice(0, 300));
      if (factCheck && !factCheck.startsWith('[Error')) {
        addTrainingPair(`Fact-check this: ${deepResponse.slice(0, 100)}`, factCheck, 'fact_check');
        updateFeed(`Polly-C (fact-check): ${factCheck.slice(0, 80)}...`);
      }
    }

    state.roundCount++;
    saveState();
  }

  function addTrainingPair(input, output, type) {
    const pair = {
      instruction: "You are Polly, the Sovereign Guide of SCBE-AETHERMOORE. Answer questions about AI governance, hyperbolic security, and the Sacred Tongues protocol.",
      input: input.slice(0, 500),
      output: output.slice(0, 500),
      metadata: {
        type,
        timestamp: new Date().toISOString(),
        model_a: MODELS.polly_a.split('/')[1],
        model_b: MODELS.polly_b.split('/')[1],
        round: state.roundCount,
        topic_idx: state.currentTopic,
        source: 'auto_conversation'
      }
    };

    state.trainingPairs.push(pair);
    state.totalPairs++;

    // Also add to Polly sidebar training logs if available
    if (window.polly && window.polly.exportTraining) {
      // Append to the sidebar's training state
    }

    // Save to localStorage
    const stored = JSON.parse(localStorage.getItem('polly_auto_training') || '[]');
    stored.push(pair);
    // Keep last 500 pairs in localStorage
    while (stored.length > 500) stored.shift();
    localStorage.setItem('polly_auto_training', JSON.stringify(stored));
    localStorage.setItem('polly_auto_total', state.totalPairs.toString());

    // Also save to memory for Polly sidebar recall
    try {
      const mem = JSON.parse(localStorage.getItem('polly_memory') || '[]');
      mem.push({ type: 'auto_training', query: input.slice(0, 100), response: output.slice(0, 200), topic: type, timestamp: new Date().toISOString() });
      while (mem.length > 100) mem.shift();
      localStorage.setItem('polly_memory', JSON.stringify(mem));
    } catch {}
  }

  function saveState() {
    localStorage.setItem('polly_auto_state', JSON.stringify({
      currentTopic: state.currentTopic,
      roundCount: state.roundCount,
      totalPairs: state.totalPairs,
    }));
  }

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem('polly_auto_state') || '{}');
      state.currentTopic = s.currentTopic || 0;
      state.roundCount = s.roundCount || 0;
      state.totalPairs = s.totalPairs || 0;
    } catch {}
  }

  // --- UI: Live Feed ---
  const feed = document.createElement('div');
  feed.id = 'polly-auto-feed';
  feed.style.cssText = `
    position: fixed; bottom: 60px; left: 16px; width: 320px; max-height: 200px;
    background: rgba(7,7,17,0.95); border: 1px solid rgba(143,255,211,0.2);
    border-radius: 12px; padding: 12px; font-size: 11px; color: #9ba3d0;
    overflow-y: auto; z-index: 90; display: none; backdrop-filter: blur(8px);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  feed.innerHTML = `<div style="font-weight:700; color:#8fffd3; margin-bottom:8px;">Polly Auto-Conversation <span id="polly-auto-count">0</span> pairs</div><div id="polly-auto-log"></div>`;

  const feedToggle = document.createElement('button');
  feedToggle.style.cssText = `
    position: fixed; bottom: 16px; left: 16px; padding: 8px 14px; border-radius: 20px;
    background: rgba(143,255,211,0.1); border: 1px solid rgba(143,255,211,0.2);
    color: #8fffd3; font-size: 11px; font-weight: 600; cursor: pointer; z-index: 91;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
  feedToggle.textContent = 'Auto-Train: OFF';
  feedToggle.addEventListener('click', () => {
    if (state.running) {
      state.running = false;
      feedToggle.textContent = `Auto-Train: OFF (${state.totalPairs} pairs)`;
      feed.style.display = 'none';
    } else {
      if (!getAutoToken()) {
        alert('Set your HuggingFace token first (localStorage: arena_keys.huggingface)');
        return;
      }
      state.running = true;
      feedToggle.textContent = 'Auto-Train: ON';
      feed.style.display = 'block';
      autoLoop();
    }
  });

  function updateFeed(msg) {
    const log = document.getElementById('polly-auto-log');
    const count = document.getElementById('polly-auto-count');
    if (log) {
      const line = document.createElement('div');
      line.style.cssText = 'padding: 3px 0; border-bottom: 1px solid rgba(123,140,255,0.06);';
      line.textContent = msg;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
      // Keep last 30 lines
      while (log.children.length > 30) log.removeChild(log.firstChild);
    }
    if (count) count.textContent = state.totalPairs;
  }

  // --- Auto-loop ---
  async function autoLoop() {
    while (state.running) {
      await runRound();
      // Wait 30 seconds between rounds to respect rate limits
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  // --- Export function ---
  window.pollyAutoExport = function() {
    const data = JSON.parse(localStorage.getItem('polly_auto_training') || '[]');
    if (data.length === 0) { alert('No auto-training data yet.'); return; }
    const blob = new Blob([data.map(d => JSON.stringify(d)).join('\n')], { type: 'application/x-jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polly_auto_training_${Date.now()}.jsonl`;
    a.click();
  };

  // --- Mount ---
  loadState();
  document.body.appendChild(feed);
  document.body.appendChild(feedToggle);
})();
