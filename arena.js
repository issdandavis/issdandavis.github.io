var PLAYERS=[
    {id:'google_ai',name:'Google AI',color:'#34d399',model:'gemini-2.5-flash',tongue:'DR',role:'Lead Architect',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=google_ai'},
    {id:'claude',name:'Claude',color:'#a78bfa',model:'claude-sonnet-4-20250514',tongue:'UM',role:'Governance Arbiter',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=claude'},
    {id:'xai',name:'xAI (Grok)',color:'#f472b6',model:'grok-3-mini',tongue:'AV',role:'Creative Advocate',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=xai'},
    {id:'huggingface',name:'HuggingFace',color:'#ff6f00',model:'inference',tongue:'AV',role:'Model Trainer',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=huggingface'},
    {id:'ollama',name:'Ollama',color:'#fbbf24',model:'local',tongue:'KO',role:'Local Runner',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=ollama'},
    {id:'groq',name:'Groq',color:'#f97316',model:'llama-3.3-70b-versatile',tongue:'KO',role:'Intent Analyst',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=groq'},
    {id:'cerebras',name:'Cerebras',color:'#06b6d4',model:'llama-3.3-70b',tongue:'RU',role:'Security Auditor',avatar:'https://api.dicebear.com/7.x/bottts/svg?seed=cerebras'}
];
var TONGUE_INSTRUCTIONS={KO:'Analyze the intent, motivation, and alignment of this query.',AV:'Explore creative solutions and narrative possibilities.',RU:'Identify risks, vulnerabilities, and edge cases.',CA:'Evaluate efficiency, cost, and implementation feasibility.',UM:'Assess policy compliance, ethics, and governance alignment.',DR:'Synthesize all perspectives into a coherent, actionable plan.'};
var PROVIDER_KEY_MAP={groq:{label:'Groq',envName:'GROQ_API_KEY'},cerebras:{label:'Cerebras',envName:'CEREBRAS_API_KEY'},google_ai:{label:'Google AI',envName:'GOOGLE_AI_KEY'},claude:{label:'Claude',envName:'ANTHROPIC_API_KEY'},xai:{label:'xAI (Grok)',envName:'XAI_API_KEY'},openrouter:{label:'OpenRouter',envName:'OPENROUTER_API_KEY'},github_models:{label:'GitHub Models',envName:'GITHUB_TOKEN'},huggingface:{label:'HuggingFace',envName:'HF_TOKEN'},ollama:{label:'Ollama',envName:null}};
var seats={},providerStatus={},deferredInstallPrompt=null;
function escHtml(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function trimText(s,m){m=m||1800;return!s?'':s.length>m?s.slice(0,m)+'\n...[trimmed]':s}
function loadArenaKeys(){try{return JSON.parse(localStorage.getItem('arena_keys')||'{}')}catch(e){return{}}}
function saveArenaKeys(k){localStorage.setItem('arena_keys',JSON.stringify(k))}
function hasKey(id){if(id==='ollama')return true;var k=loadArenaKeys();return!!(k[id]&&k[id].trim())}
function getKey(id){return(loadArenaKeys()[id]||'').trim()}
function getOllamaUrl(){return(localStorage.getItem('ollama_base_url')||'http://localhost:11434').replace(/\/+$/,'')}
function availablePlayerIds(){return PLAYERS.map(function(p){return p.id}).filter(function(id){return!(providerStatus[id]&&providerStatus[id].available===false)})}
function orderedAvailableIds(){var a=availablePlayerIds(),pr=['google_ai','claude','xai','github_models','huggingface','ollama','groq','cerebras','openrouter'];var r=pr.filter(function(id){return a.indexOf(id)!==-1});a.forEach(function(id){if(r.indexOf(id)===-1)r.push(id)});return r}
function narratorSeatId(){var ids=orderedAvailableIds();return ids.length?ids[0]:PLAYERS[0].id}
function buildTableSeats(){
    var table=document.getElementById('tableArea');
    if(!table) return;
    var existingSeats=document.querySelectorAll('.seat');
    existingSeats.forEach(s => s.remove());
    var radius = window.innerWidth > 900 ? 38 : 42; 
    PLAYERS.forEach(function(p, i){
        var seat=document.createElement('div');
        seat.className='seat';
        seat.id='seat-'+p.id;
        var angle = (i / PLAYERS.length) * (2 * Math.PI) - (Math.PI / 2);
        var x = 50 + radius * Math.cos(angle);
        var y = 50 + radius * Math.sin(angle);
        seat.style.left = x + '%';
        seat.style.top = y + '%';
        seat.innerHTML=`
            <div class="speech-bubble" id="bubble-${p.id}"></div>
            <div class="avatar-wrap" style="border-color:${p.color}">
                <img src="${p.avatar}" class="avatar-img">
            </div>
            <div class="name-tag" style="border-color:${p.color}">${p.name}</div>
            <div class="seat-role">${p.role}</div>
            <div class="model-status nokey" id="status-${p.id}" style="font-size:8px; margin-top:4px">no key</div>
        `;
        table.appendChild(seat);
        seats[p.id]={player:p,messages:[]};
    });
}
function addMessage(pid,role,text,meta){
    var bubble=document.getElementById('bubble-'+pid);
    var seat=document.getElementById('seat-'+pid);
    if(!bubble || !seat) return;
    var c=escHtml(text);
    c=c.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre>$2</pre>');
    c=c.replace(/`([^`]+)`/g,'<code>$1</code>');
    bubble.innerHTML = `<div class="msg-text">${c}</div><div class="msg-meta" style="font-size:8px; color:var(--dim); margin-top:4px">${meta||''}</div>`;
    seat.classList.add('active');
    var scroll=document.getElementById('scrollContent');
    if(scroll && role !== 'error' && role !== 'user'){
        if(scroll.innerText === 'Waiting for DM prompt...') scroll.innerText = '';
        scroll.innerText += `\n\n[${pid.toUpperCase()}]: ${text}`;
        var sharedScroll = document.getElementById('sharedScroll');
        if(sharedScroll) sharedScroll.scrollTop = sharedScroll.scrollHeight;
    }
}
function setStatus(pid,status,label){
    var el=document.getElementById('status-'+pid);
    var seat=document.getElementById('seat-'+pid);
    if(!el || !seat) return;
    el.className='model-status '+status;
    el.textContent=label||status;
    if(status === 'thinking') seat.classList.add('thinking');
    else seat.classList.remove('thinking');
}
function refreshKeyStatus(){var anyKey=false;PLAYERS.forEach(function(p){var has=hasKey(p.id);providerStatus[p.id]={available:has};if(!has)setStatus(p.id,'nokey','no key');else{setStatus(p.id,'ready','ready');anyKey=true}});var b=document.getElementById('setupBanner');if(anyKey&&b)b.classList.remove('visible')}
function openSettings(){var ov=document.getElementById('settingsOverlay'),c=document.getElementById('settingsCloudRows'),keys=loadArenaKeys();c.innerHTML='';PLAYERS.forEach(function(p){var cfg=PROVIDER_KEY_MAP[p.id];if(!cfg||p.id==='ollama')return;var r=document.createElement('div');r.className='settings-row';r.innerHTML='<div class="dot" style="background:'+p.color+'"></div><label>'+cfg.label+'</label><input type="password" id="key-'+p.id+'" placeholder="'+cfg.envName+'" value="'+escHtml(keys[p.id]||'')+'"/><button class="test-btn" onclick="testConnection(\''+p.id+'\')">Test</button><span class="test-result" id="test-'+p.id+'"></span>';c.appendChild(r)});var ol=document.getElementById('ollamaBaseUrl');if(ol)ol.value=getOllamaUrl();ov.classList.add('open')}
function closeSettings(){document.getElementById('settingsOverlay').classList.remove('open')}
function saveSettings(){var keys={};PLAYERS.forEach(function(p){if(p.id==='ollama')return;var inp=document.getElementById('key-'+p.id);if(inp&&inp.value.trim())keys[p.id]=inp.value.trim()});saveArenaKeys(keys);var ol=document.getElementById('ollamaBaseUrl');if(ol&&ol.value.trim())localStorage.setItem('ollama_base_url',ol.value.trim());closeSettings();refreshKeyStatus()}
document.addEventListener('click',function(e){if(e.target===document.getElementById('settingsOverlay'))closeSettings()});
async function testConnection(pid){var r=document.getElementById('test-'+pid);if(!r)return;r.textContent='...';r.style.color='var(--amber)';var inp=document.getElementById('key-'+pid),key=inp?inp.value.trim():'';if(!key){r.textContent='No key';r.style.color='var(--red)';return}try{await callProvider(pid,'Say OK.','Test. Reply OK.',key);r.textContent='OK';r.style.color='var(--green)'}catch(err){r.textContent='Fail';r.style.color='var(--red)';r.title=err.message}}
async function testOllama(){var r=document.getElementById('testOllama');if(!r)return;r.textContent='...';r.style.color='var(--amber)';var u=document.getElementById('ollamaBaseUrl'),base=u?u.value.trim().replace(/\/+$/,''):'http://localhost:11434';try{var resp=await fetch(base+'/api/tags');if(!resp.ok)throw new Error('HTTP '+resp.status);var d=await resp.json();r.textContent=(d.models?d.models.length:0)+' models';r.style.color='var(--green)'}catch(err){r.textContent='Fail';r.style.color='var(--red)';r.title=err.message||'Cannot reach Ollama. Set OLLAMA_ORIGINS=*'}}
async function callOpenAICompatible(url,apiKey,model,sys,usr,extra){var h=Object.assign({'Content-Type':'application/json'},extra||{});if(apiKey)h['Authorization']='Bearer '+apiKey;var resp=await fetch(url,{method:'POST',headers:h,body:JSON.stringify({model:model,messages:[{role:'system',content:sys},{role:'user',content:usr}],max_tokens:1024,temperature:0.7})});var d=await resp.json();if(!resp.ok)throw new Error((d.error&&d.error.message)||d.detail||JSON.stringify(d));return(d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content)||''}
async function callGoogle(key,model,sys,usr){var resp=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+key,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({system_instruction:{parts:[{text:sys}]},contents:[{role:'user',parts:[{text:usr}]}],generationConfig:{maxOutputTokens:1024,temperature:0.7}})});var d=await resp.json();if(!resp.ok)throw new Error((d.error&&d.error.message)||JSON.stringify(d));var p=d.candidates&&d.candidates[0]&&d.candidates[0].content&&d.candidates[0].content.parts;return p?p.map(function(x){return x.text||''}).join(''):''}
async function callClaude(key,model,sys,usr){var resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:model,max_tokens:1024,system:sys,messages:[{role:'user',content:usr}]})});var d=await resp.json();if(!resp.ok)throw new Error((d.error&&d.error.message)||JSON.stringify(d));return(d.content&&d.content.map(function(b){return b.text||''}).join(''))||''}
async function callHuggingFace(key,usr){var resp=await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-3.3-70B-Instruct',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({inputs:usr,parameters:{max_new_tokens:1024,temperature:0.7,return_full_text:false}})});var d=await resp.json();if(!resp.ok)throw new Error(d.error||JSON.stringify(d));if(Array.isArray(d)&&d[0])return d[0].generated_text||'';return typeof d==='string'?d:JSON.stringify(d)}
async function callOllama(model,sys,usr){var base=getOllamaUrl();var resp=await fetch(base+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:model||'llama3',system:sys,prompt:usr,stream:false})});var d=await resp.json();if(!resp.ok)throw new Error(d.error||JSON.stringify(d));return d.response||''}
async function callProvider(pid,sys,usr,overrideKey){var p=PLAYERS.find(function(x){return x.id===pid}),model=p?p.model:'',key=overrideKey||getKey(pid);switch(pid){case'groq':return callOpenAICompatible('https://api.groq.com/openai/v1/chat/completions',key,model,sys,usr);case'cerebras':return callOpenAICompatible('https://api.cerebras.ai/v1/chat/completions',key,model,sys,usr);case'xai':return callOpenAICompatible('https://api.x.ai/v1/chat/completions',key,model,sys,usr);case'openrouter':return callOpenAICompatible('https://openrouter.ai/api/v1/chat/completions',key,'moonshotai/kimi-k2-0711-preview',sys,usr,{'HTTP-Referer':window.location.origin,'X-Title':'AetherCode Arena'});case'github_models':return callOpenAICompatible('https://models.inference.ai.azure.com/chat/completions',key,model,sys,usr);case'google_ai':return callGoogle(key,model,sys,usr);case'claude':return callClaude(key,model,sys,usr);case'huggingface':return callHuggingFace(key,sys+'\n\n'+usr);case'ollama':return callOllama(model!=='local'?model:'llama3',sys,usr);default:throw new Error('Unknown provider: '+pid)}}
async function askPlayer(pid,message){var text=message||'';if(!text){var inp=document.getElementById('dealInput');if(inp)text=inp.value.trim()}if(!text)return null;if(!hasKey(pid)){var cfg=PROVIDER_KEY_MAP[pid];addMessage(pid,'error','No API key configured. Click "Keys" and enter your '+(cfg?cfg.envName:'key')+'.');return null}setStatus(pid,'thinking','thinking...');var player=PLAYERS.find(function(p){return p.id===pid}),ti=player?TONGUE_INSTRUCTIONS[player.tongue]||'':'',sys=player?'You are the '+player.role+' ('+player.tongue+' tongue) in the AI Round Table. '+ti:'';var t0=performance.now();try{var response=await callProvider(pid,sys,text);var lat=Math.round(performance.now()-t0);addMessage(pid,'ai',response,player.model+' / '+lat+'ms');setStatus(pid,'ready','ready');return{id:pid,name:player.name,tongue:player.tongue,role:player.role,response:response}}catch(err){var msg=err.message||'Request failed';if(msg.indexOf('Failed to fetch')!==-1||msg.indexOf('NetworkError')!==-1||msg.indexOf('CORS')!==-1)addMessage(pid,'error','Connection failed. Check your API key and network. For Ollama, ensure OLLAMA_ORIGINS=* is set.');else addMessage(pid,'error',msg);setStatus(pid,'error','error');setTimeout(function(){if(hasKey(pid))setStatus(pid,'ready','ready');else setStatus(pid,'nokey','no key')},5000);return null}}
async function dealToAll(){var inp=document.getElementById('dealInput'),text=inp.value.trim();if(!text)return;inp.value='';var btn=document.getElementById('dealBtn');btn.disabled=true;btn.textContent='Dealing...';await Promise.allSettled(PLAYERS.map(function(p){return askPlayer(p.id,text)}));btn.disabled=false;btn.textContent='Deal'}
async function relayChain(){var inp=document.getElementById('dealInput'),text=inp.value.trim();if(!text)return;inp.value='';var btn=document.getElementById('relayBtn');btn.disabled=true;btn.textContent='Relaying...';var ids=orderedAvailableIds().slice(0,6);if(!ids.length){btn.disabled=false;btn.textContent='Relay';return}var transcript=[],baton=text;for(var i=0;i<ids.length;i++){var res=await askPlayer(ids[i],'RELAY MODE\nOriginal: "'+text+'"\nBaton:\n'+trimText(baton,1200)+'\n\nAdd one useful step.\n1) Insight 2) Action 3) Handoff');if(res&&res.response){baton=res.response;transcript.push('['+res.name+'] '+trimText(res.response,900))}}if(transcript.length){var sid=ids.indexOf('google_ai')!==-1?'google_ai':narratorSeatId();var s=await askPlayer(sid,'RELAY TRANSCRIPT\n'+transcript.join('\n\n---\n\n')+'\n\nReturn a practical execution plan.');if(s&&s.response)addMessage(s.id||sid,'synthesis','[RELAY SYNTHESIS] '+s.response)}btn.disabled=false;btn.textContent='Relay'}
async function debateDuel(){var inp=document.getElementById('dealInput'),topic=inp.value.trim();if(!topic)return;inp.value='';var btn=document.getElementById('debateBtn');btn.disabled=true;btn.textContent='Debating...';var ids=orderedAvailableIds();if(ids.length<2){btn.disabled=false;btn.textContent='Debate';return}var a=ids[0],b=ids[1];var aO=await askPlayer(a,'DEBATE OPENING\nTopic: '+topic+'\nTake a strong position with 3 claims.');var bR=await askPlayer(b,'DEBATE REBUTTAL\nTopic: '+topic+'\nOpponent:\n'+trimText(aO?aO.response:'',1000)+'\n\nRebut with evidence.');var aC=await askPlayer(a,'DEBATE COUNTER\nTopic: '+topic+'\nRebuttal:\n'+trimText(bR?bR.response:'',1000)+'\n\nCounter with revised plan.');var sid=ids.indexOf('google_ai')!==-1?'google_ai':narratorSeatId();var s=await askPlayer(sid,'DEBATE LOG\nTopic: '+topic+'\nA: '+trimText(aO?aO.response:'',1000)+'\nB: '+trimText(bR?bR.response:'',1000)+'\nA counter: '+trimText(aC?aC.response:'',1000)+'\nProduce: winner, why, merged plan.');if(s&&s.response)addMessage(s.id||sid,'synthesis','[DEBATE SYNTHESIS] '+s.response);btn.disabled=false;btn.textContent='Debate'}
async function deliberate(){var inp=document.getElementById('dealInput'),text=inp.value.trim();if(!text)return;inp.value='';var btn=document.getElementById('deliberateBtn');btn.disabled=true;btn.textContent='Deliberating...';var results=await Promise.allSettled(PLAYERS.map(function(p){return askPlayer(p.id,text)}));var responses=results.filter(function(r){return r.status==='fulfilled'&&r.value}).map(function(r){return'['+r.value.name+' / '+r.value.tongue+' / '+r.value.role+']:\n'+r.value.response}).join('\n\n---\n\n');if(responses){var s=await askPlayer('google_ai','ROUND TABLE SYNTHESIS\nAsked: "'+text+'"\n'+PLAYERS.length+' responded:\n\n'+responses+'\n\nSynthesize: 1. Agreement 2. Disagreement 3. Recommendation 4. Action items');if(s)addMessage('google_ai','synthesis','[ROUND TABLE CONSENSUS] '+s.response)}btn.disabled=false;btn.textContent='Deliberate'}
function isStandaloneMode(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function updateInstallUi(){var b=document.getElementById('arenaInstallBtn');if(!b)return;b.textContent=isStandaloneMode()?'Installed':'Install App';b.disabled=isStandaloneMode()}
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(function(){});
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferredInstallPrompt=e;updateInstallUi()});
window.addEventListener('appinstalled',function(){deferredInstallPrompt=null;updateInstallUi()});
async function promptInstall(){if(isStandaloneMode())return;if(!deferredInstallPrompt){alert('Use your browser menu to install (Add to Home Screen).');return}deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}finally{deferredInstallPrompt=null;updateInstallUi()}}
document.getElementById('dealInput').addEventListener('keydown',function(e){if(e.key==='Enter'&&e.shiftKey){e.preventDefault();deliberate()}else if(e.key==='Enter')dealToAll()});

function shareDebate(){
    const content = document.getElementById('scrollContent').innerText;
    if(!content || content === 'Waiting for DM prompt...') {
        alert('Start a debate first to share!');
        return;
    }
    const blob = btoa(unescape(encodeURIComponent(content)));
    const url = window.location.origin + window.location.pathname + '#debate=' + blob;
    
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('shareBtn');
        const oldText = btn.textContent;
        btn.textContent = 'Copied Link!';
        btn.style.color = 'var(--mint)';
        setTimeout(() => {
            btn.textContent = oldText;
            btn.style.color = 'var(--aqua)';
        }, 2000);
    });
}

function loadSharedDebate(){
    const hash = window.location.hash;
    if(hash && hash.startsWith('#debate=')){
        const blob = hash.substring(8);
        try {
            const content = decodeURIComponent(escape(atob(blob)));
            const scroll = document.getElementById('scrollContent');
            if(scroll) {
                scroll.innerText = content;
                const sharedScroll = document.getElementById('sharedScroll');
                if(sharedScroll) sharedScroll.scrollTop = sharedScroll.scrollHeight;
            }
        } catch(e) {
            console.error('Failed to load shared debate', e);
        }
    }
}

window.addEventListener('load', () => {
    buildTableSeats();
    updateInstallUi();
    refreshKeyStatus();
    loadSharedDebate();
});