import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const data = {
  './assistant-routing.json': JSON.parse(source('assistant-routing.json')),
  './assistant-catalog.json': JSON.parse(source('assistant-catalog.json'))
};

class Element {
  listeners = {};
  children = [];
  innerHTML = '';
  value = '';
  dataset = {};
  addEventListener(event, handler) { this.listeners[event] = handler; }
  appendChild(element) { this.children.push(element); }
  requestSubmit() { return this.listeners.submit({ preventDefault() {} }); }
  focus() {}
  scrollIntoView() {}
}

for (const scenario of ['published', 'network failure', 'bad response', 'invalid JSON']) {
  const elements = {};
  const browser = { location: { href: 'https://aethermoore.com/assistant.html' } };
  const studio = new Element();
  studio.dataset.assistantPrompt = 'Open Clay Studio';
  const grab = (id) => elements[id] ||= new Element();
  const context = {
    window: browser,
    document: {
      getElementById: grab,
      querySelectorAll: () => [studio],
      createElement: () => new Element()
    },
    Blob, URL, AbortSignal,
    fetch: async (url) => {
      if (scenario === 'network failure') throw new Error('network unavailable');
      if (scenario === 'bad response') return { ok: false };
      if (scenario === 'invalid JSON') return { ok: true, json: async () => ({}) };
      return { ok: true, json: async () => data[url] };
    }
  };

  runInNewContext(source('static/polly-catalog-fallback.js'), context);
  runInNewContext(source('static/polly-assistant.js'), context);
  const input = grab('assistant-input');
  const form = grab('assistant-form');
  const history = grab('assistant-history');
  const lastReply = () => history.children.at(-1).innerHTML;

  async function ask(question, expected) {
    input.value = question;
    await form.requestSubmit();
    assert.match(lastReply(), expected);
  }

  // Exercise the listener immediately, before either network request can settle.
  await ask('How much is the AI Governance Snapshot?', /Published price: <strong>\$500 one-time/);
  assert.match(lastReply(), /https:\/\/aethermoore\.com\/governance-snapshot\.html/);
  await ask('What does the AI Governance Toolkit do?', /<strong>AI Governance Toolkit<\/strong>/);
  await ask('I need help with a purchase', /shortest route is <strong>support<\/strong>/);
  await ask('My AI Governance Toolkit download doesn’t work', /shortest route is <strong>support<\/strong>/);
  await ask('What was refuted in the evidence ledger?', /AetherMoore Evidence Ledger/);
  await ask('I need a custom assistant for my site that routes users and products.', /Assistant and site setup/);
  await ask('Is the AI Governance Snapshot available for proprietary government work?', /falls into a gated lane/);
  const packet = JSON.parse(grab('assistant-packet').textContent);
  assert.equal(packet.execution.visibility, 'gated');
  assert.deepEqual(packet.execution.repo_targets, []);
  await ask('What is the capital of Mars?', /Nothing in the catalog matched/);
  await ask('Compare public packages', /shortest route is <strong>shop<\/strong>/);
  studio.listeners.click();
  assert.match(lastReply(), /shortest route is <strong>studio<\/strong>/);
  assert.match(grab('assistant-packet-download').href, /^blob:/);
  assert.equal(grab('assistant-packet-copy').disabled, false);
  assert.match(grab('assistant-status').innerHTML, scenario === 'published' ? /Catalog router/ : /Built-in catalog/);
  URL.revokeObjectURL(grab('assistant-packet-download').href);
  console.log('PASS:', scenario);
}
