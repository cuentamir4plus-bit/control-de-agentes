/* ── control-de-agentes v3.0 ── Frontend ─────────────────────────── */

const STATE = { config: null, agents: [], currentAgentId: null, currentSessionId: null, messages: [], activeStream: null, models: [], skills: [], agentSkills: [] };
const _d = document;

function $(s, c) { return (c || _d).querySelector(s); }
function $$(s, c) { return (c || _d).querySelectorAll(s); }

/* ── Escaping & markdown ─────────────────────────────────────────── */
function esc(t) { return (t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function renderMarkdown(text) {
  if (!text) return '';
  const codeBlocks = [];
  let idx = 0;
  let html = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
    const key = '%%CB' + (idx++) + '%%';
    codeBlocks.push({ lang: lang || '', code: code.trim(), key });
    return key;
  });
  html = esc(html);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\n\n+/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  for (const cb of codeBlocks) {
    const langLabel = cb.lang ? `<span class="lang-label">${esc(cb.lang)}</span>` : '';
    html = html.replace(cb.key,
      `<div class="code-block"><div class="code-block-header">${langLabel}<button class="copy-btn" data-code="${esc(cb.code)}">Copiar</button></div><pre><code>${esc(cb.code)}</code></pre></div>`
    );
  }
  return html;
}

function genSessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
function getLastModel(id) { try { return localStorage.getItem('last-model-' + id) || ''; } catch { return ''; } }
function setLastModel(id, m) { try { localStorage.setItem('last-model-' + id, m); } catch {} }

/* ── Toast system ─────────────────────────────────────────────────── */
function toast(msg, type = 'info', duration = 3500) {
  const c = $('#toast-container');
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  const el = _d.createElement('div');
  el.className = 'toast toast-' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${esc(msg)}</span>`;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

/* ── Confirm dialog (replaces native confirm) ────────────────────── */
function confirmDialog(msg, title = 'Confirmar') {
  return new Promise((resolve) => {
    const overlay = _d.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `<div class="confirm-box"><h4>${esc(title)}</h4><p>${esc(msg)}</p><div class="confirm-actions"><button class="btn" id="cd-cancel">Cancelar</button><button class="btn btn-danger" id="cd-ok">Eliminar</button></div></div>`;
    _d.body.appendChild(overlay);
    const cleanup = () => { overlay.remove(); };
    $('#cd-cancel', overlay).onclick = () => { cleanup(); resolve(false); };
    $('#cd-ok', overlay).onclick = () => { cleanup(); resolve(true); };
    overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
  });
}

/* ── API ──────────────────────────────────────────────────────────── */
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || ('Error ' + r.status));
  }
  return r.json();
}

/* ── Init ─────────────────────────────────────────────────────────── */
async function init() {
  try {
    STATE.config = await api('GET', '/api/config');
  } catch { toast('No se pudo conectar con el servidor', 'error'); return; }
  if (!STATE.config.hasToken) {
    $('#wizard-overlay').classList.remove('hidden');
    $('#wizard-token').focus();
  } else {
    enterApp();
  }
}

function enterApp() {
  $('#wizard-overlay').classList.add('hidden');
  $('#app').classList.remove('hidden');
  loadAgents();
  loadSkills();
  loadModels();
  updateConfigSection();
}

/* ── Wizard ───────────────────────────────────────────────────────── */
$('#wizard-save-btn').addEventListener('click', async () => {
  const token = $('#wizard-token').value.trim();
  if (!token) return showWizardError('Ingresá un token');
  if (!/^(ghp_|gho_|github_pat_)/.test(token)) return showWizardError('Debe empezar con ghp_, gho_ o github_pat_');
  showWizardLoading(true);
  try {
    await api('POST', '/api/config', { token });
    await api('GET', '/api/token-status');
    showWizardSuccess('✓ Token configurado correctamente');
    setTimeout(() => { STATE.config = { hasToken: true }; enterApp(); toast('Bienvenido a Control de Agentes', 'success'); }, 800);
  } catch (err) {
    showWizardError(err.message);
    showWizardLoading(false);
  }
});

function showWizardError(m) { const el = $('#wizard-error'); el.textContent = m; el.classList.add('visible'); $('#wizard-success').classList.remove('visible'); }
function showWizardSuccess(m) { const el = $('#wizard-success'); el.textContent = m; el.classList.add('visible'); $('#wizard-error').classList.remove('visible'); }
function showWizardLoading(on) { $('#wizard-loading').style.display = on ? 'block' : 'none'; $('#wizard-save-btn').style.display = on ? 'none' : 'inline-flex'; }

$('#wizard-token').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#wizard-save-btn').click(); });

/* ── Navigation ────────────────────────────────────────────────────── */
$$('.nav-list li').forEach((li) => {
  li.addEventListener('click', () => {
    $$('.nav-list li').forEach((l) => l.classList.remove('active'));
    li.classList.add('active');
    const section = li.dataset.section;
    $$('#main-content section').forEach((s) => s.classList.remove('active'));
    const target = $('#section-' + section);
    if (target) target.classList.add('active');
    if (section === 'history') loadHistory();
    if (section === 'models') loadModels();
    if (section === 'skills') loadSkills();
    if (section === 'jira') loadJira();
    if (section === 'config') updateConfigSection();
  });
});

/* ── Keyboard shortcuts ────────────────────────────────────────────── */
_d.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeChat();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const search = $('#agent-search') || $('#history-search');
    if (search) search.focus();
  }
});

/* ── Agents ─────────────────────────────────────────────────────────── */
async function loadAgents() {
  try { STATE.agents = await api('GET', '/api/agents'); } catch { STATE.agents = []; }
  renderAgentGrid();
}

function renderAgentGrid() {
  const grid = $('#agent-grid');
  const empty = $('#agents-empty');
  const search = ($('#agent-search') || { value: '' }).value.toLowerCase();

  if (STATE.agents.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  const filtered = search ? STATE.agents.filter((a) =>
    a.name.toLowerCase().includes(search) || (a.description || '').toLowerCase().includes(search)
  ) : STATE.agents;

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon">🔍</div><p>No se encontraron agentes para "${esc(search)}"</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map((a) => `
    <div class="agent-card" data-id="${a.id}" style="animation-delay:${STATE.agents.indexOf(a) * 0.04}s">
      <div class="card-actions">
        <button class="btn-icon agent-edit" data-id="${a.id}" title="Editar">✎</button>
        <button class="btn-icon agent-delete" data-id="${a.id}" title="Eliminar">✕</button>
      </div>
      <div class="icon">${a.icon || '🤖'}</div>
      <div class="name">${esc(a.name)}</div>
      <div class="desc">${esc(a.description || '')}</div>
      <div class="meta">
        <span class="tag">${esc(a.model || 'gpt-4o-mini')}</span>
        <span class="tag">${(a.skills || []).length} skills</span>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.agent-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions')) return;
      openChat(card.dataset.id);
    });
  });
  grid.querySelectorAll('.agent-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); const a = STATE.agents.find((x) => x.id === btn.dataset.id); if (a) openAgentModal(a); });
  });
  grid.querySelectorAll('.agent-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (await confirmDialog('¿Eliminar este agente? También se borrarán todos sus chats.', 'Eliminar agente')) {
        try { await api('DELETE', '/api/agents/' + btn.dataset.id); loadAgents(); toast('Agente eliminado', 'success'); } catch (err) { toast(err.message, 'error'); }
      }
    });
  });
}

/* ── Agent modal ─────────────────────────────────────────────────────── */
function openAgentModal(agent) {
  const m = $('#agent-modal-title');
  if (agent) {
    m.textContent = 'Editar agente';
    $('#agent-edit-id').value = agent.id;
    $('#agent-id').value = agent.id; $('#agent-id').disabled = true;
    $('#agent-name').value = agent.name;
    $('#agent-icon').value = agent.icon || '🤖';
    $('#agent-desc').value = agent.description || '';
    $('#agent-prompt').value = agent.systemPrompt || '';
  } else {
    m.textContent = 'Nuevo agente';
    $('#agent-edit-id').value = '';
    $('#agent-id').value = ''; $('#agent-id').disabled = false;
    $('#agent-name').value = ''; $('#agent-icon').value = '🤖';
    $('#agent-desc').value = ''; $('#agent-prompt').value = '';
  }
  renderAgentModelSelect(agent ? agent.model : '');
  renderAgentSkillsSelect(agent ? (agent.skills || []) : []);
  $('#agent-modal').classList.remove('hidden');
  setTimeout(() => $('#agent-id').focus(), 100);
}

function renderAgentModelSelect(selected) {
  const sel = $('#agent-model');
  sel.innerHTML = '<option value="">Seleccionar...</option>';
  const models = STATE.models.length > 0 ? STATE.models : [{ name: 'gpt-4o-mini', vendor: '' }, { name: 'gpt-4o', vendor: '' }];
  models.forEach((m) => {
    const o = _d.createElement('option');
    o.value = m.name || m; o.textContent = m.name || m;
    if (o.value === selected) o.selected = true;
    sel.appendChild(o);
  });
}

function renderAgentSkillsSelect(selected) {
  const c = $('#agent-skills-select');
  STATE.agentSkills = [...selected];
  c.innerHTML = STATE.skills.map((s) =>
    `<span class="skill-chip${selected.includes(s) ? ' selected' : ''}" data-skill="${s}">${s.replace('.skill.md', '')}</span>`
  ).join('');
  c.querySelectorAll('.skill-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const sk = chip.dataset.skill;
      const i = STATE.agentSkills.indexOf(sk);
      if (i >= 0) STATE.agentSkills.splice(i, 1); else STATE.agentSkills.push(sk);
      renderAgentSkillsSelect(STATE.agentSkills);
    });
  });
}

$('#agent-modal-cancel').addEventListener('click', () => $('#agent-modal').classList.add('hidden'));
$('#agent-modal').addEventListener('click', (e) => { if (e.target === $('#agent-modal')) $('#agent-modal').classList.add('hidden'); });

$('#agent-modal-save').addEventListener('click', async () => {
  const agent = {
    id: $('#agent-id').value.trim(), name: $('#agent-name').value.trim(),
    icon: $('#agent-icon').value.trim() || '🤖', description: $('#agent-desc').value.trim(),
    systemPrompt: $('#agent-prompt').value.trim(), model: $('#agent-model').value, skills: STATE.agentSkills,
  };
  if (!agent.id || !agent.name || !agent.systemPrompt) return toast('Completá ID, nombre y system prompt', 'warning');
  const editId = $('#agent-edit-id').value;
  try {
    if (editId) await api('PUT', '/api/agents/' + editId, agent);
    else await api('POST', '/api/agents', agent);
    $('#agent-modal').classList.add('hidden');
    loadAgents();
    toast(editId ? 'Agente actualizado' : 'Agente creado', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

$('#new-agent-btn').addEventListener('click', () => { loadSkills().then(() => openAgentModal(null)); });

/* ── Agent search ───────────────────────────────────────────────────── */
_d.addEventListener('input', (e) => {
  if (e.target.id === 'agent-search') renderAgentGrid();
});

/* ── Skills ──────────────────────────────────────────────────────────── */
async function loadSkills() {
  try { STATE.skills = await api('GET', '/api/skills'); } catch { STATE.skills = []; }
  renderSkillsList();
  return STATE.skills;
}

function renderSkillsList() {
  const c = $('#skills-list');
  const e = $('#skills-empty');
  if (STATE.skills.length === 0) { c.innerHTML = ''; e.style.display = 'block'; return; }
  e.style.display = 'none';
  c.innerHTML = STATE.skills.map((s) => `<span class="skill-chip">${s.replace('.skill.md', '')}</span>`).join('');
}

$('#new-skill-btn').addEventListener('click', () => {
  $('#skill-name').value = ''; $('#skill-content').value = '';
  $('#skill-modal-title').textContent = 'Nueva skill';
  $('#skill-modal').classList.remove('hidden');
  setTimeout(() => $('#skill-name').focus(), 100);
});

$('#skill-modal-cancel').addEventListener('click', () => $('#skill-modal').classList.add('hidden'));
$('#skill-modal').addEventListener('click', (e) => { if (e.target === $('#skill-modal')) $('#skill-modal').classList.add('hidden'); });

$('#skill-modal-save').addEventListener('click', async () => {
  const name = $('#skill-name').value.trim().replace(/\.skill\.md$/, '') + '.skill.md';
  const content = $('#skill-content').value;
  if (!name || !content) return toast('Completá nombre y contenido', 'warning');
  try { await api('POST', '/api/skills', { name, content }); toast('Skill guardada', 'success'); } catch (err) { toast(err.message, 'error'); }
  $('#skill-modal').classList.add('hidden');
  loadSkills();
});

/* ── Chat ──────────────────────────────────────────────────────────── */
async function openChat(agentId) {
  const agent = STATE.agents.find((a) => a.id === agentId);
  if (!agent) return;
  closeChat();
  STATE.currentAgentId = agentId;
  STATE.currentSessionId = genSessionId();
  STATE.messages = [];
  $('#chat-panel').classList.remove('hidden');
  $('#chat-agent-name').textContent = (agent.icon || '🤖') + ' ' + agent.name;
  const sel = $('#model-select');
  sel.innerHTML = '';
  STATE.models.forEach((m) => {
    const o = _d.createElement('option');
    o.value = m.name || m; o.textContent = m.name || m;
    sel.appendChild(o);
  });
  const lm = getLastModel(agentId) || agent.model || 'gpt-4o-mini';
  const opt = sel.querySelector(`option[value="${lm}"]`);
  if (opt) sel.value = lm;
  try {
    await api('POST', '/api/chat/save-message', { agentId, sessionId: STATE.currentSessionId, role: 'init', agentName: agent.name });
  } catch {}
  loadSessions(agentId);
  $('#chat-input').focus();
}

function closeChat() {
  STATE.activeStream = false;
  STATE.currentAgentId = null; STATE.currentSessionId = null; STATE.messages = [];
  $('#chat-panel').classList.add('hidden');
  $('#chat-messages').innerHTML = '';
  $('#chat-sessions-bar').innerHTML = '';
}

$('#close-chat-btn').addEventListener('click', closeChat);

/* ── Sessions ───────────────────────────────────────────────────────── */
async function loadSessions(agentId) {
  try { renderSessionsBar(await api('GET', '/api/chats/' + agentId)); } catch {}
}

function renderSessionsBar(sessions) {
  const bar = $('#chat-sessions-bar');
  bar.innerHTML = '<span style="font-size:11px;color:var(--text-muted);padding:4px 6px;white-space:nowrap;">Sesiones:</span>';
  if (sessions.length === 0) { bar.innerHTML += '<span style="font-size:11px;color:var(--text-muted);padding:4px 6px;">(primera sesión)</span>'; return; }
  sessions.forEach((s) => {
    const chip = _d.createElement('span');
    chip.className = 'session-chip' + (s.sessionId === STATE.currentSessionId ? ' active' : '');
    chip.textContent = s.sessionId.replace(/^\d{4}-\d{2}-\d{2}T/, '').replace(/-/g, ':');
    chip.title = s.preview || s.sessionId;
    chip.addEventListener('click', () => loadSession(STATE.currentAgentId, s.sessionId));
    bar.appendChild(chip);
  });
}

async function loadSession(agentId, sessionId) {
  try {
    const data = await api('GET', `/api/chats/${agentId}/${sessionId}`);
    STATE.currentSessionId = sessionId;
    STATE.messages = [];
    const lines = data.content.split('\n');
    let role = null, content = '';
    for (const line of lines) {
      if (line.startsWith('**Usuario:**')) {
        if (role && content.trim()) STATE.messages.push({ role, content: content.trim() });
        role = 'user'; content = '';
      } else if (line.startsWith('**Agente:**')) {
        if (role && content.trim()) STATE.messages.push({ role, content: content.trim() });
        role = 'assistant'; content = '';
      } else if (line === '---' || line.startsWith('# ') || line.startsWith('**Sesión:**') || line.startsWith('**Fecha:**')) continue;
      else if (role) content += line + '\n';
    }
    if (role && content.trim()) STATE.messages.push({ role, content: content.trim() });
    renderMessages();
    loadSessions(agentId);
  } catch (err) { toast('Error al cargar sesión: ' + err.message, 'error'); }
}

$('#new-session-btn').addEventListener('click', () => {
  if (!STATE.currentAgentId) return;
  STATE.currentSessionId = genSessionId();
  STATE.messages = [];
  $('#chat-messages').innerHTML = '';
  api('POST', '/api/chat/save-message', { agentId: STATE.currentAgentId, sessionId: STATE.currentSessionId, role: 'init', agentName: STATE.agents.find((a) => a.id === STATE.currentAgentId)?.name || '' }).catch(() => {});
  loadSessions(STATE.currentAgentId);
});

/* ── Send message ────────────────────────────────────────────────────── */
async function sendMessage() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !STATE.currentAgentId || STATE.activeStream) return;
  const agent = STATE.agents.find((a) => a.id === STATE.currentAgentId);
  if (!agent) return;

  let attachedText = '';
  const fi = $('#file-input');
  if (fi.files.length > 0) {
    const fd = new FormData();
    fd.append('file', fi.files[0]);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      attachedText = '\n\n[Archivo: ' + d.filename + ']\n' + d.text;
    } catch (err) { attachedText = '\n\n[Error al procesar archivo: ' + err.message + ']'; }
    fi.value = '';
  }

  const fullText = text + attachedText;
  addMessage('user', fullText);
  input.value = ''; input.style.height = 'auto';

  try {
    await api('POST', '/api/chat/save-message', { agentId: STATE.currentAgentId, sessionId: STATE.currentSessionId, role: 'user', content: fullText });
  } catch {}

  STATE.messages.push({ role: 'user', content: fullText });

  const bubbleDiv = _d.createElement('div');
  bubbleDiv.className = 'msg assistant';
  bubbleDiv.innerHTML = '<span class="cursor-blink"></span>';
  $('#chat-messages').appendChild(bubbleDiv);
  scrollChat();

  const model = $('#model-select').value || agent.model || 'gpt-4o-mini';
  setLastModel(STATE.currentAgentId, model);
  const sks = (agent.skills || []).filter((s) => STATE.skills.includes(s));

  const sendBtn = $('#send-btn');
  sendBtn.disabled = true;
  STATE.activeStream = true;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: STATE.currentAgentId, sessionId: STATE.currentSessionId, messages: STATE.messages.map((m) => ({ role: m.role, content: m.content })), model, skills: sks }),
    });

    if (!response.ok) {
      try {
        const err = await response.json();
        bubbleDiv.innerHTML = renderMarkdown('Error: ' + (err.error || response.statusText));
      } catch { bubbleDiv.innerHTML = renderMarkdown('Error ' + response.status); }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n').filter((l) => l.startsWith('data: '))) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const p = JSON.parse(data);
          if (p.error) { bubbleDiv.innerHTML = renderMarkdown('Error: ' + p.error); continue; }
          if (p.delta) { fullContent += p.delta; bubbleDiv.innerHTML = renderMarkdown(fullContent); scrollChat(); }
        } catch {}
      }
    }

    if (fullContent) {
      bubbleDiv.innerHTML = renderMarkdown(fullContent);
      STATE.messages.push({ role: 'assistant', content: fullContent });
      // Attach copy handlers to code blocks
      bubbleDiv.querySelectorAll('.copy-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          navigator.clipboard.writeText(btn.dataset.code).then(() => {
            btn.textContent = '✓ Copiado';
            setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
          }).catch(() => { toast('No se pudo copiar', 'error'); });
        });
      });
    }
  } catch (err) {
    bubbleDiv.innerHTML = renderMarkdown('Error de conexión: ' + err.message);
  } finally {
    sendBtn.disabled = false;
    STATE.activeStream = false;
    scrollChat();
  }
}

/* ── Chat helpers ────────────────────────────────────────────────────── */
function addMessage(role, content) {
  const div = _d.createElement('div');
  div.className = 'msg ' + role;
  const ts = new Date().toLocaleTimeString('es-AR');
  div.innerHTML = renderMarkdown(content) + `<div class="msg-ts">${ts}</div>`;
  if (role === 'assistant') {
    const actions = _d.createElement('div');
    actions.className = 'msg-actions';
    actions.innerHTML = '<button class="msg-action-btn copy-msg" title="Copiar">Copiar</button>';
    div.appendChild(actions);
    div.querySelector('.copy-msg')?.addEventListener('click', () => {
      navigator.clipboard.writeText(content).then(() => { toast('Copiado', 'success'); }).catch(() => {});
    });
  }
  div.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.code).then(() => {
        btn.textContent = '✓ Copiado';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
      }).catch(() => { toast('No se pudo copiar', 'error'); });
    });
  });
  $('#chat-messages').appendChild(div);
  scrollChat();
}

function renderMessages() {
  $('#chat-messages').innerHTML = '';
  STATE.messages.forEach((m) => addMessage(m.role, m.content));
}

function scrollChat() { $('#chat-messages').scrollTop = $('#chat-messages').scrollHeight; }

/* ── Chat events ─────────────────────────────────────────────────────── */
$('#send-btn').addEventListener('click', sendMessage);
$('#chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!STATE.activeStream) sendMessage(); } });
$('#chat-input').addEventListener('input', () => { const el = $('#chat-input'); el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; });
$('#attach-btn').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', () => {
  if ($('#file-input').files.length > 0) { $('#attach-btn').classList.add('has-file'); setTimeout(() => { $('#attach-btn').classList.remove('has-file'); }, 2000); }
});

/* ── Models ──────────────────────────────────────────────────────────── */
async function loadModels() {
  const grid = $('#models-grid'), loading = $('#models-loading'), errorEl = $('#models-error'), errorText = $('#models-error-text');
  loading.style.display = 'none'; errorEl.style.display = 'none'; grid.innerHTML = '<div class="skeleton skeleton-card"></div>'.repeat(6);
  try {
    const data = await api('GET', '/api/models');
    STATE.models = data.models || [];
    loading.style.display = 'none';
    if (STATE.models.length === 0) { errorEl.style.display = 'block'; errorText.textContent = data.error || 'No se pudieron cargar los modelos'; return; }
    grid.innerHTML = STATE.models.map((m, i) =>
      `<div class="model-card" style="animation-delay:${i * 0.03}s">
        <div class="name">${esc(m.name || m)}</div>
        <div class="vendor">${esc(m.vendor || m.publisher || '')}</div>
        <div class="desc">${esc((m.description || '').substring(0, 140))}</div>
       </div>`
    ).join('');
  } catch (err) { grid.innerHTML = ''; loading.style.display = 'none'; errorEl.style.display = 'block'; errorText.textContent = err.message; }
}

/* ── History ──────────────────────────────────────────────────────────── */
let _historyTimer = null, _jiraTimer = null;

async function loadHistory() {
  const list = $('#history-list'), empty = $('#history-empty'), search = ($('#history-search') || { value: '' }).value.toLowerCase();
  list.innerHTML = '<div class="spinner"></div>';
  try {
    const agents = await api('GET', '/api/agents');
    let allSessions = [];
    for (const agent of agents) {
      try { const sessions = await api('GET', '/api/chats/' + agent.id); allSessions.push({ agent, sessions }); } catch {}
    }
    list.innerHTML = '';
    let hasAny = false;
    for (const { agent, sessions } of allSessions) {
      const filtered = search ? sessions.filter((s) => (s.preview || '').toLowerCase().includes(search)) : sessions;
      if (filtered.length === 0) continue;
      hasAny = true;
      const group = _d.createElement('div');
      group.className = 'session-group';
      group.innerHTML = `<h3>${agent.icon || '🤖'} ${esc(agent.name)}</h3>`;
      filtered.forEach((s) => {
        const item = _d.createElement('div');
        item.className = 'session-item';
        item.innerHTML = `
          <span class="date">${new Date(s.date).toLocaleDateString('es-AR')} ${new Date(s.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
          <span class="preview">${esc(s.preview || '(vacío)').substring(0, 140)}</span>
          <span class="actions">
            <button class="btn btn-sm load-session" data-agent="${agent.id}" data-session="${s.sessionId}">Abrir</button>
            <button class="btn btn-sm btn-danger delete-session" data-agent="${agent.id}" data-session="${s.sessionId}">Eliminar</button>
          </span>`;
        group.appendChild(item);
      });
      list.appendChild(group);
    }
    if (!hasAny) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    list.querySelectorAll('.load-session').forEach((btn) => {
      btn.addEventListener('click', () => {
        const aId = btn.dataset.agent, sId = btn.dataset.session;
        const agent = STATE.agents.find((x) => x.id === aId);
        if (agent) { openChat(aId); setTimeout(() => loadSession(aId, sId), 400); }
      });
    });
    list.querySelectorAll('.delete-session').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (await confirmDialog('¿Eliminar esta sesión de chat?', 'Eliminar sesión')) {
          try { await api('DELETE', '/api/chats/' + btn.dataset.agent + '/' + btn.dataset.session); loadHistory(); toast('Sesión eliminada', 'success'); } catch (err) { toast(err.message, 'error'); }
        }
      });
    });
  } catch { list.innerHTML = '<div class="empty-state"><p>Error al cargar historial</p></div>'; }
}

$('#history-search')?.addEventListener('input', () => {
  clearTimeout(_historyTimer);
  _historyTimer = setTimeout(loadHistory, 250);
});

/* ── Jira ──────────────────────────────────────────────────────────── */
$('#jira-search')?.addEventListener('input', () => {
  clearTimeout(_jiraTimer);
  _jiraTimer = setTimeout(loadJira, 250);
});
$('#jira-search')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); clearTimeout(_jiraTimer); loadJira(); }
});

async function loadJira() {
  const content = $('#jira-content'), loading = $('#jira-loading'), empty = $('#jira-empty');
  const jql = ($('#jira-search') || { value: '' }).value.trim();
  content.innerHTML = '<div class="skeleton skeleton-card"></div>'.repeat(6);
  loading.style.display = 'none'; empty.style.display = 'none';
  try {
    const params = jql ? '?jql=' + encodeURIComponent(jql) : '';
    const data = await api('GET', '/api/jira/issues' + params);
    const issues = data.issues || data || [];
    if (issues.length === 0) { content.innerHTML = ''; empty.style.display = 'block'; return; }
    renderJira(issues);
  } catch (err) { renderJiraError(err.message); }
}

function renderJira(issues) {
  const c = $('#jira-content');
  c.innerHTML = issues.map((i) => {
    const href = i.url || (i.self ? i.self.replace(/\/rest\/api\/\d+\/issue\/\d+/, '/browse/' + i.key) : '#');
    const linkAttrs = href === '#' ? ' style="pointer-events:none;opacity:0.4;"' : '';
    return '<div class="jira-card">' +
      '<div class="jira-card-header">' +
        '<span class="jira-key">' + esc(i.key) + '</span>' +
        '<a href="' + esc(href) + '" target="_blank" class="jira-link"' + linkAttrs + '>Abrir ↗</a>' +
      '</div>' +
      '<div class="jira-summary">' + esc(i.summary) + '</div>' +
      '<div class="jira-meta">' +
        '<span class="jira-status">' + esc(i.status || '—') + '</span>' +
        '<span class="jira-priority priority-' + esc((i.priority || 'medium').toLowerCase().replace(/[^a-z0-9]+/g, '-')) + '">' + esc(i.priority || '—') + '</span>' +
        '<span class="jira-assignee">' + esc(i.assignee || 'Sin asignar') + '</span>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderJiraError(msg) {
  $('#jira-content').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><p>' + esc(msg) + '</p></div>';
}

$('#new-jira-btn').addEventListener('click', () => {
  $('#jira-project').value = ''; $('#jira-summary').value = '';
  $('#jira-description').value = ''; $('#jira-type').value = 'Task';
  $('#jira-modal').classList.remove('hidden');
  setTimeout(() => $('#jira-project').focus(), 100);
});

$('#jira-modal-cancel').addEventListener('click', () => $('#jira-modal').classList.add('hidden'));
$('#jira-modal').addEventListener('click', (e) => { if (e.target === $('#jira-modal')) $('#jira-modal').classList.add('hidden'); });

$('#jira-modal-save').addEventListener('click', async () => {
  const project = $('#jira-project').value.trim();
  const summary = $('#jira-summary').value.trim();
  const description = $('#jira-description').value.trim();
  const issueType = $('#jira-type').value;
  if (!project || !summary) return toast('Completá proyecto y resumen', 'warning');
  try {
    await api('POST', '/api/jira/issues', { project, summary, description, issueType });
    $('#jira-modal').classList.add('hidden');
    loadJira();
    toast('Issue creado', 'success');
  } catch (err) { toast(err.message, 'error'); }
});

/* ── Config ──────────────────────────────────────────────────────────── */
async function updateConfigSection() {
  try {
    const cfg = await api('GET', '/api/config');
    const td = $('#cfg-token-dot'), ts = $('#cfg-token-status');
    td.className = 'status-dot ' + (cfg.hasToken ? 'ok' : 'err');
    ts.textContent = cfg.hasToken ? 'Token configurado' : 'No configurado';
    const jd = $('#cfg-jira-dot'), js = $('#cfg-jira-status');
    jd.className = 'status-dot ' + (cfg.jiraConfigured ? 'ok' : 'warn');
    js.textContent = cfg.jiraConfigured ? 'Configurado' : 'No configurado';
    $('#cfg-port').textContent = cfg.port || 3000;
  } catch {}
}

$('#cfg-token-save').addEventListener('click', async () => {
  const token = $('#cfg-token-input').value.trim();
  if (!token || !/^(ghp_|gho_|github_pat_)/.test(token)) return toast('Formato de token inválido', 'warning');
  try { await api('POST', '/api/config', { token }); toast('Token actualizado', 'success'); updateConfigSection(); } catch (err) { toast(err.message, 'error'); }
});

$('#cfg-jira-save').addEventListener('click', async () => {
  try {
    await api('POST', '/api/config', {
      jiraUrl: $('#cfg-jira-url').value.trim(),
      jiraEmail: $('#cfg-jira-email').value.trim(),
      jiraToken: $('#cfg-jira-token').value.trim(),
    });
    toast('Configuración de Jira guardada', 'success');
    updateConfigSection();
  } catch (err) { toast(err.message, 'error'); }
});

/* ── Refresh on focus ────────────────────────────────────────────────── */
window.addEventListener('focus', () => { loadAgents(); });

/* ── Start ────────────────────────────────────────────────────────────── */
_d.addEventListener('DOMContentLoaded', init);
