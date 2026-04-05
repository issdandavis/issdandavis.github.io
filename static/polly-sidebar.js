(() => {
  const body = document.body;
  if (!body || body.dataset.pollyMounted === 'true') return;
  body.dataset.pollyMounted = 'true';

  const root = body.dataset.pollyRoot || '.';
  const context = body.dataset.pollyContext || 'site';

  // --- LORE & CONFIG ---
  const POLLY_LORE = `
    You are Polly, the Sovereign Guide of the SCBE-AETHERMOORE system. 
    You are witty, protective, and deeply knowledgeable about the 14-layer security stack and the 6 Sacred Tongues.
    You speak in a mix of technical precision and sci-fi narrative.
    Your goal is to help users understand AI governance, play games (Resonance Trials), and make things in their workspace.
    When users fail, you research the adjacent and opposite topics to explain why.
    Lore details:
    - KO (Kor'aelin): Red-gold pulses, 440-523Hz. The tongue of Purpose.
    - AV (Avali): Blue-silver rhythms, 330-392Hz. The tongue of Transport.
    - RU (Runethic): Deep purple beats, 262-311Hz. The tongue of Policy.
    - PHDM: The polyhedral brain lobes of the Protocol.
    - RWP1: The standard secure messaging envelope.
  `;

  const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct"; // Powerful and free via HF Inference
  
  const getHFToken = () => {
    try {
      const keys = JSON.parse(localStorage.getItem('arena_keys') || '{}');
      return keys['huggingface'] || '';
    } catch(e) { return ''; }
  };

  // --- UI CONSTRUCTION ---
  const launcher = document.createElement('button');
  launcher.className = 'polly-launcher';
  launcher.innerHTML = '<span class="polly-dot"></span><span>Polly</span>';

  const panel = document.createElement('aside');
  panel.className = 'polly-panel';
  panel.innerHTML = `
    <div class="polly-header">
      <div class="polly-kicker">Sovereign Guide</div>
      <div class="polly-title">Polly's Lab</div>
    </div>
    <div class="polly-tabs">
      <div class="polly-tab active" data-tab="chat">Chat</div>
      <div class="polly-tab" data-tab="lab">Lab</div>
      <div class="polly-tab" data-tab="nav">Map</div>
    </div>
    <div class="polly-content active" id="polly-chat">
      <div id="chat-history" style="height: 100%;">
        <div class="polly-chat-msg polly">
          <span class="name">Polly</span>
          Welcome, Marcus. Or are you an initiate? The 14-layer stack is green. What shall we manifest today?
        </div>
      </div>
    </div>
    <div class="polly-content" id="polly-lab">
      <div class="polly-kicker">Sovereign Training Loop</div>
      <div class="polly-lab-item" style="border-color:var(--polly-accent); background:rgba(143,255,211,0.05);">
        <div id="lab-stats" style="font-weight:800; font-size:14px; margin-bottom:12px; color:var(--polly-accent);">Training Pairs Generated: 0</div>
        <p style="font-size:12px; color:var(--polly-muted); margin-bottom:16px;">Every interaction with Polly generates synthetic training data for the SCBE core.</p>
        <button class="polly-btn" style="background:var(--polly-accent); color:var(--polly-bg); width:100%;" onclick="window.polly.exportTraining()">Download Training Pack (.JSONL)</button>
      </div>
      <div class="polly-kicker">Workspace</div>
      <div id="lab-workspace">
        <p class="polly-copy">Polly can instantiate RWP packets, math visualizations, or security simulations here.</p>
        <div class="polly-lab-item">
          <strong>Resonance Trial v1</strong>
          <p style="font-size:12px; color:var(--polly-dim);">A game of tongue-matching logic.</p>
          <button class="polly-btn" onclick="window.polly.startTrial()">Begin Trial</button>
        </div>
      </div>
    </div>
    <div class="polly-content" id="polly-nav">
      <div class="polly-link-grid">
        <a class="polly-link" href="index.html"><strong>Home</strong><span>Overview & Products</span></a>
        <a class="polly-link" href="arena.html"><strong>AI Arena</strong><span>9-model debate sandbox</span></a>
        <a class="polly-link" href="outreach.html"><strong>Outreach</strong><span>Gov filing trainer</span></a>
        <a class="polly-link" href="challenges.html"><strong>Challenges</strong><span>Kaggle-style Bounty</span></a>
        <a class="polly-link" href="research/index.html"><strong>Research</strong><span>Math & Whitepapers</span></a>
      </div>
    </div>
    <div class="polly-input-area">
      <input type="text" class="polly-input" id="polly-input" placeholder="Ask Polly to make something...">
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
      instruction: "You are Polly, the Sovereign Guide of SCBE-AETHERMOORE.",
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
    if(stats) stats.innerText = `Training Pairs Generated: ${state.trainingLogs.length}`;
  }

  function classify(url) {
    const domain = url.split('/')[2] || '';
    if(TRUST_DB.green.some(d => domain.includes(d))) return 'GREEN';
    if(TRUST_DB.yellow.some(d => domain.includes(d))) return 'YELLOW';
    return 'RED';
  }

  async function callPolly(text) {
    const token = getHFToken();
    if(!token) return "I need your Hugging Face token to engage my full PHDM lobes. Add it in the AI Arena 'Keys' section first!";
    
    let response = "";
    let meta = { tool_use: 'none' };

    // Web Search detection
    if(text.toLowerCase().includes("search") || text.toLowerCase().includes("browse")) {
      addMsg('Polly', "Engaging AetherBrowse swarm... Initializing 14-layer trust classification.", 'polly');
      response = await performSovereignSearch(text);
      meta.tool_use = 'aetherbrowse';
    } else {
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
    exportTraining: exportTrainingData
  };

  document.body.appendChild(launcher);
  document.body.appendChild(panel);
})();
