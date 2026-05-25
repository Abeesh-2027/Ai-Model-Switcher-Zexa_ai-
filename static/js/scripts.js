// ── State ──
let selectedModel = 'llama3';
let messageCount = 0;
let tokenEstimate = 0;
let attachedFiles = [];
let isLoading = false;
const API_BASE = '';   // same origin (FastAPI serves the page too)

// ── Model definitions ──
const MODELS = {
  llama3:  { icon:'🦙', name:'LLaMA 3',  detail:'Meta · 70B params',      desc:'Best for: reasoning, coding, long-context tasks.', speed:70, accuracy:88, context:80,
             keywords:['llama','meta','open','fast','reasoning','general','logic','explain'] },
  phi3:    { icon:'Φ',  name:'Phi-3',    detail:'Microsoft · 3.8B params', desc:'Best for: lightweight, fast inference, mobile use.',  speed:92, accuracy:74, context:55,
             keywords:['phi','microsoft','small','efficient','compact','quick','lightweight','mobile','simple'] },
  mistral: { icon:'🌬️',name:'Mistral',  detail:'Mistral AI · 7B params',  desc:'Best for: creative tasks, multilingual, balanced.',  speed:82, accuracy:82, context:72,
             keywords:['mistral','french','european','creative','multilingual','balanced','write','story','poem','essay','novel'] },
  gemma:   { icon:'💎', name:'Gemma 2',  detail:'Google · 9B params',      desc:'Best for: structured data, summarization, Q&A.',     speed:78, accuracy:83, context:68,
             keywords:['gemma','google','structured','data','summarize','summary','question','qa','list','table'] },
  qwen:    { icon:'🔮', name:'Qwen 2.5', detail:'Alibaba · 72B params',    desc:'Best for: multilingual, coding, large documents.',   speed:65, accuracy:91, context:95,
             keywords:['qwen','alibaba','chinese','multilingual','long','document','code','coding','large','programming','function','class'] },
};

// ── Greeting ──
function setGreeting() {
  const h = new Date().getHours();
  const [timeLabel, greeting] =
    h >= 5  && h < 12 ? ['🌅 Morning',   'Good Morning']  :
    h >= 12 && h < 17 ? ['☀️ Afternoon', 'Good Afternoon']:
    h >= 17 && h < 21 ? ['🌆 Evening',   'Good Evening']  :
                        ['🌙 Night',     'Good Night'];
  document.getElementById('greetingTime').textContent = timeLabel;
  document.getElementById('greetingText').textContent = greeting;
}

// ── Auto-resize textarea ──
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  document.getElementById('charCount').textContent = `${el.value.length} / 4096`;
}

// ── Model auto-detection ──
let detectTimeout;
function detectModel(text) {
  clearTimeout(detectTimeout);
  if (!text.trim()) { hideAutoNotice(); return; }

  detectTimeout = setTimeout(() => {
    const lower = text.toLowerCase();
    let bestModel = null, bestScore = 0;
    for (const [id, m] of Object.entries(MODELS)) {
      let score = 0;
      for (const kw of m.keywords) {
        if (lower.includes(kw)) score += kw.length;
      }
      if (score > bestScore) { bestScore = score; bestModel = id; }
    }
    if (bestModel && bestScore > 2 && bestModel !== selectedModel) {
      selectModel(bestModel, true);
    }
  }, 400);
}

function showAutoNotice(modelName) {
  const n = document.getElementById('autoNotice');
  document.getElementById('autoNoticeText').textContent = `Auto-selected: ${modelName}`;
  n.style.display = 'flex';
}
function hideAutoNotice() {
  document.getElementById('autoNotice').style.display = 'none';
}

// ── Model selection ──
function selectModel(modelId, auto = false) {
  selectedModel = modelId;
  const m = MODELS[modelId];

  document.querySelectorAll('.model-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.model === modelId));

  // Right sidebar card
  document.getElementById('cardIcon').textContent    = m.icon;
  document.getElementById('cardName').textContent    = m.name;
  document.getElementById('cardDetail').textContent  = m.detail;
  document.getElementById('cardDesc').textContent    = m.desc;
  document.getElementById('barSpeed').style.width    = m.speed + '%';
  document.getElementById('barAccuracy').style.width = m.accuracy + '%';
  document.getElementById('barContext').style.width  = m.context + '%';

  // Footer label
  document.getElementById('selectedModelLabel').innerHTML =
    `<i class="fa fa-circle-dot"></i> ${m.name}`;

  // Topbar (mobile)
  document.getElementById('topbarIcon').textContent = m.icon;
  document.getElementById('topbarName').textContent = m.name;

  if (auto) showAutoNotice(m.name);
}

// ── Mobile sidebar ──
function openMobileNav() {
  document.getElementById('sidebarLeft').classList.add('open');
  document.getElementById('mobileOverlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}
function closeMobileNav() {
  document.getElementById('sidebarLeft').classList.remove('open');
  document.getElementById('mobileOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}
document.getElementById('mobileNavToggle').addEventListener('click', openMobileNav);

// ── File attach ──
function handleFileAttach(e) {
  attachedFiles = [...attachedFiles, ...Array.from(e.target.files)];
  renderFileChips();
  e.target.value = '';
}
function renderFileChips() {
  const c = document.getElementById('fileChips');
  c.innerHTML = '';
  attachedFiles.forEach((f, i) => {
    const chip = document.createElement('div');
    chip.className = 'fc';
    chip.innerHTML = `<i class="fa fa-file"></i>${f.name}<button class="fc-remove" onclick="removeFile(${i})"><i class="fa fa-xmark"></i></button>`;
    c.appendChild(chip);
  });
}
function removeFile(i) { attachedFiles.splice(i, 1); renderFileChips(); }

// ── Insert prompt chip ──
function insertPrompt(text) {
  const input = document.getElementById('userInput');
  input.value = text;
  autoResize(input);
  detectModel(text);
  input.focus();
}

// ── Simple markdown renderer ──
function renderMarkdown(text) {
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```lang\n...\n```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4 style="margin:0.5em 0 0.2em;font-size:0.9em">$1</h4>');
  html = html.replace(/^## (.+)$/gm,  '<h3 style="margin:0.5em 0 0.2em;font-size:1em">$1</h3>');
  html = html.replace(/^# (.+)$/gm,   '<h2 style="margin:0.5em 0 0.2em;font-size:1.1em">$1</h2>');

  // Bullet lists
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin-left:1.2em;list-style:disc">$1</li>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:1.4em;list-style:decimal">$1</li>');

  // Line breaks (but not inside code)
  html = html.replace(/\n/g, '<br>');

  return html;
}

// ── Send message ──
async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('userInput');
  const text = input.value.trim();
  if (!text) return;

  const files = [...attachedFiles];
  attachedFiles = [];
  renderFileChips();
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('charCount').textContent = '0 / 4096';
  hideAutoNotice();

  // Hide greeting, show messages
  document.getElementById('greetingZone').classList.add('hidden');
  const messagesEl = document.getElementById('messages');
  messagesEl.classList.add('visible');

  appendMessage('user', text, files);
  updateStats(text);

  isLoading = true;
  document.getElementById('sendBtn').classList.add('loading');
  const loadingId = appendTypingIndicator();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, model: selectedModel }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Server error ${res.status}`);
    }

    const data = await res.json();
    removeTypingIndicator(loadingId);
    appendMessage('assistant', data.response || 'No response.', [], false);
    updateStats(data.response || '', true);
  } catch (err) {
    removeTypingIndicator(loadingId);
    appendMessage('assistant', `⚠️ ${err.message}`, [], true);
  }

  isLoading = false;
  document.getElementById('sendBtn').classList.remove('loading');
}

// ── Append message ──
function appendMessage(role, text, files = [], isError = false) {
  const messagesEl = document.getElementById('messages');
  const m = MODELS[selectedModel];
  const isUser = role === 'user';
  const time = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

  const wrap = document.createElement('div');
  wrap.className = `msg ${role}${isError ? ' msg-error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = isUser ? '👤' : m.icon;

  const body = document.createElement('div');
  body.className = 'msg-body';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = isUser ? `You · ${time}` : `${m.name} · ${time}`;

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (files.length) {
    files.forEach(f => {
      const fc = document.createElement('div');
      fc.className = 'msg-file-chip';
      fc.innerHTML = `<i class="fa fa-paperclip"></i>${f.name}`;
      bubble.appendChild(fc);
    });
  }

  if (isUser) {
    bubble.appendChild(document.createTextNode(text));
  } else {
    // Render markdown for assistant messages
    bubble.innerHTML += renderMarkdown(text);
  }

  body.appendChild(meta);
  body.appendChild(bubble);

  if (isUser) { wrap.appendChild(body); wrap.appendChild(avatar); }
  else        { wrap.appendChild(avatar); wrap.appendChild(body); }

  messagesEl.appendChild(wrap);
  requestAnimationFrame(() => messagesEl.scrollTop = messagesEl.scrollHeight);
  messageCount++;
}

// ── Typing indicator ──
function appendTypingIndicator() {
  const messagesEl = document.getElementById('messages');
  const m = MODELS[selectedModel];
  const id = 'typing-' + Date.now();
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  wrap.id = id;
  wrap.innerHTML = `
    <div class="msg-avatar">${m.icon}</div>
    <div class="msg-body">
      <div class="msg-meta">${m.name} is thinking…</div>
      <div class="msg-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>
    </div>`;
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return id;
}
function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ── Stats (sync both desktop + mobile counters) ──
function updateStats(text, isAssistant = false) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  tokenEstimate += Math.ceil(words * 1.3);
  const count = messageCount + 1;
  const tokens = tokenEstimate > 999 ? (tokenEstimate / 1000).toFixed(1) + 'k' : tokenEstimate;

  document.getElementById('statMsgs').textContent    = count;
  document.getElementById('statTokens').textContent  = tokens;
  // Mobile counters inside left sidebar
  const mm = document.getElementById('statMsgsMobile');
  const mt = document.getElementById('statTokensMobile');
  if (mm) mm.textContent = count;
  if (mt) mt.textContent = tokens;
}

// ── Clear chat ──
function clearChat() {
  document.getElementById('messages').innerHTML = '';
  document.getElementById('messages').classList.remove('visible');
  document.getElementById('greetingZone').classList.remove('hidden');
  messageCount = 0; tokenEstimate = 0;
  ['statMsgs','statTokens','statMsgsMobile','statTokensMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '0';
  });

  // Also clear server-side history
  fetch(`${API_BASE}/clear`, { method: 'POST' }).catch(() => {});
}

// ── Key handler ──
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ── Model button clicks ──
document.querySelectorAll('.model-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectModel(btn.dataset.model, false);
    hideAutoNotice();
    // Close mobile nav after selection
    if (window.innerWidth <= 768) closeMobileNav();
  });
});

// ── Check which Ollama models are pulled ──
async function checkAvailableModels() {
  try {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) return;
    const data = await res.json();
    document.querySelectorAll('.model-btn').forEach(btn => {
      const key = btn.dataset.model;
      const avail = data.available?.[key];
      // Add/remove a visual "not pulled" indicator
      btn.querySelector('.model-indicator').style.background =
        avail ? '' : 'var(--orange, #fb923c)';
      btn.title = avail ? '' : `Run: ollama pull ${OLLAMA_NAMES[key] || key}`;
    });
  } catch (_) {}
}

const OLLAMA_NAMES = {
  llama3: 'llama3', phi3: 'phi3', mistral: 'mistral', gemma: 'gemma2', qwen: 'qwen2.5'
};

// ── Init ──
setGreeting();
selectModel('llama3');
checkAvailableModels();