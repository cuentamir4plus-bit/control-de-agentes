import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import mammoth from 'mammoth';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Wrap async route handlers to catch errors ──────────────────────────
['get','post','put','delete'].forEach(method => {
  const orig = app[method].bind(app);
  app[method] = (path, ...handlers) => orig(path, ...handlers.map(h =>
    h.constructor.name === 'AsyncFunction' ? (req, res, next) => h(req, res, next).catch(next) : h
  ));
});

const PORT = process.env.PORT || 3000;

// ── Directorios automáticos ─────────────────────────────────────────────
const DIRS = ['agents', 'chats', 'outputs', 'config/skills', 'uploads'];
await Promise.all(DIRS.map((d) => fs.mkdir(path.join(__dirname, d), { recursive: true })));

// ── Helpers ──────────────────────────────────────────────────────────────
async function writeFileAtomic(filePath, content) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, content, 'utf8');
  try { await fs.unlink(filePath); } catch { /* si no existe, ok */ }
  await fs.rename(tmp, filePath);
}

function safePath(base, ...parts) {
  const resolved = path.resolve(base, ...parts);
  const baseResolved = path.resolve(base);
  const sep = path.sep;
  if (!resolved.toLowerCase().startsWith((baseResolved + sep).toLowerCase()) && resolved !== baseResolved) {
    throw new Error('Path traversal detectado');
  }
  return resolved;
}

function sanitizeId(id) {
  return /^[a-zA-Z0-9\-_]+$/.test(id);
}

function generateSessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function sessionFilePath(agentId, sessionId) {
  return safePath(__dirname, 'chats', agentId, `${sessionId}.md`);
}

async function initSessionFile(agentId, sessionId, agentName) {
  const dir = safePath(__dirname, 'chats', agentId);
  await fs.mkdir(dir, { recursive: true });
  const header = `# Chat — ${agentName}\n**Sesión:** ${sessionId}\n**Fecha:** ${new Date().toLocaleString('es-AR')}\n\n---\n\n`;
  await writeFileAtomic(sessionFilePath(agentId, sessionId), header);
}

async function appendToSessionFile(agentId, sessionId, role, content) {
  const label = role === 'user' ? '**Usuario:**' : '**Agente:**';
  const ts = new Date().toLocaleTimeString('es-AR');
  const entry = `\n${label} *(${ts})*\n\n${content}\n\n---\n`;
  await fs.appendFile(sessionFilePath(agentId, sessionId), entry, 'utf8');
}

// ── Middleware ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'panel')));

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ── Config ───────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    hasToken: !!process.env.GITHUB_TOKEN,
    port: PORT,
    jiraConfigured: !!(process.env.JIRA_URL && process.env.JIRA_TOKEN),
  });
});

app.post('/api/config', async (req, res) => {
  const { token, jiraUrl, jiraEmail, jiraToken } = req.body;

  if (token) {
    if (!/^(ghp_|gho_|github_pat_)/.test(token)) {
      return res.status(400).json({ error: 'Formato de token inválido. Debe empezar con ghp_, gho_ o github_pat_' });
    }
    process.env.GITHUB_TOKEN = token;
  }

  if (jiraUrl) process.env.JIRA_URL = jiraUrl;
  if (jiraEmail) process.env.JIRA_EMAIL = jiraEmail;
  if (jiraToken) process.env.JIRA_TOKEN = jiraToken;

  const envContent = [
    `GITHUB_TOKEN=${process.env.GITHUB_TOKEN || ''}`,
    `PORT=${PORT}`,
    `JIRA_URL=${process.env.JIRA_URL || ''}`,
    `JIRA_EMAIL=${process.env.JIRA_EMAIL || ''}`,
    `JIRA_TOKEN=${process.env.JIRA_TOKEN || ''}`,
  ].join('\n');

  const envPath = path.join(__dirname, '.env');
  await writeFileAtomic(envPath, envContent);
  res.json({ ok: true });
});

app.get('/api/token-status', async (_req, res) => {
  if (!process.env.GITHUB_TOKEN) {
    return res.json({ valid: false, error: 'No configurado' });
  }
  try {
    const r = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(10000),
    });
    res.json({ valid: r.ok, status: r.status });
  } catch {
    res.json({ valid: false, error: 'No se pudo verificar el token' });
  }
});

// ── Agentes ──────────────────────────────────────────────────────────────
app.get('/api/agents', async (_req, res) => {
  const dir = path.join(__dirname, 'agents');
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
  const agents = await Promise.all(
    files.map(async (f) => {
      try {
        const content = await fs.readFile(path.join(dir, f), 'utf8');
        return JSON.parse(content);
      } catch {
        return null;
      }
    })
  );
  res.json(agents.filter(Boolean));
});

app.post('/api/agents', async (req, res) => {
  const { id, name, systemPrompt, icon, description, skills, model } = req.body;
  if (!id || !sanitizeId(id)) {
    return res.status(400).json({ error: 'ID inválido. Solo alfanumérico, guiones y guión bajo.' });
  }
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  if (!systemPrompt) return res.status(400).json({ error: 'System prompt requerido' });

  const agent = {
    id,
    name,
    icon: icon || '🤖',
    description: description || '',
    systemPrompt,
    skills: skills || [],
    model: model || 'gpt-4o-mini',
    createdAt: new Date().toISOString(),
  };
  const filePath = safePath(__dirname, 'agents', `${id}.json`);
  await writeFileAtomic(filePath, JSON.stringify(agent, null, 2));
  res.json(agent);
});

app.put('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  if (!sanitizeId(id)) return res.status(400).json({ error: 'ID inválido' });
  const filePath = safePath(__dirname, 'agents', `${id}.json`);
  const existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const updated = { ...existing, ...req.body, id };
  await writeFileAtomic(filePath, JSON.stringify(updated, null, 2));
  res.json(updated);
});

app.delete('/api/agents/:id', async (req, res) => {
  const { id } = req.params;
  if (!sanitizeId(id)) return res.status(400).json({ error: 'ID inválido' });
  const filePath = safePath(__dirname, 'agents', `${id}.json`);
  await fs.unlink(filePath);
  const chatDir = safePath(__dirname, 'chats', id);
  await fs.rm(chatDir, { recursive: true, force: true });
  res.json({ ok: true });
});

// ── Skills ────────────────────────────────────────────────────────────────
app.get('/api/skills', async (_req, res) => {
  const dir = path.join(__dirname, 'config', 'skills');
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.skill.md'));
  res.json(files);
});

app.get('/api/skills/:name', async (req, res) => {
  const { name } = req.params;
  const filePath = safePath(__dirname, 'config', 'skills', name);
  const content = await fs.readFile(filePath, 'utf8');
  res.json({ name, content });
});

app.post('/api/skills', async (req, res) => {
  const { name, content } = req.body;
  if (!name || !content) {
    return res.status(400).json({ error: 'Nombre y contenido requeridos' });
  }
  const filePath = safePath(__dirname, 'config', 'skills', name);
  await writeFileAtomic(filePath, content);
  res.json({ ok: true, name });
});

// ── Chats ────────────────────────────────────────────────────────────────
app.get('/api/chats/:agentId', async (req, res) => {
  const { agentId } = req.params;
  if (!sanitizeId(agentId)) return res.status(400).json({ error: 'ID inválido' });
  const dir = safePath(__dirname, 'chats', agentId);
  try {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md'));
    const sessions = await Promise.all(
      files.map(async (f) => {
        const fullPath = path.join(dir, f);
        const stat = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const preview = lines.slice(4, 10).join(' ').substring(0, 200);
        const sessionId = f.replace(/\.md$/, '');
        return { sessionId, fileName: f, date: stat.mtime.toISOString(), size: stat.size, preview };
      })
    );
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(sessions.slice(0, 20));
  } catch {
    res.json([]);
  }
});

app.get('/api/chats/:agentId/:sessionId', async (req, res) => {
  const { agentId, sessionId } = req.params;
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const filePath = sessionFilePath(agentId, sessionId);
  const content = await fs.readFile(filePath, 'utf8');
  res.json({ agentId, sessionId, content });
});

app.delete('/api/chats/:agentId/:sessionId', async (req, res) => {
  const { agentId, sessionId } = req.params;
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const filePath = sessionFilePath(agentId, sessionId);
  await fs.unlink(filePath);
  res.json({ ok: true });
});

// ── Chat (streaming SSE) ─────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { agentId, sessionId, messages, model, skills = [] } = req.body;

  if (!agentId || !messages || !model) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }
  if (!process.env.GITHUB_TOKEN) {
    return res.status(401).json({ error: 'GitHub Token no configurado' });
  }

  let agent;
  try {
    const agentPath = safePath(__dirname, 'agents', `${agentId}.json`);
    agent = JSON.parse(await fs.readFile(agentPath, 'utf8'));
  } catch {
    return res.status(404).json({ error: 'Agente no encontrado' });
  }

  let systemPrompt = agent.systemPrompt || '';
  if (skills.length > 0) {
    const contents = await Promise.all(
      skills.map(async (s) => {
        try {
          return await fs.readFile(safePath(__dirname, 'config', 'skills', s), 'utf8');
        } catch {
          return '';
        }
      })
    );
    systemPrompt += '\n\n---\n' + contents.filter(Boolean).join('\n\n---\n');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `API error ${response.status}: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    let fullContent = '';
    const decoder = new TextDecoder();

    for await (const chunk of response.body) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split('\n').filter((l) => l.startsWith('data: '));
      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch {
          // chunk malformado — ignorar
        }
      }
    }

    if (sessionId && fullContent) {
      try {
        await appendToSessionFile(agentId, sessionId, 'assistant', fullContent);
      } catch {
        // si falla la persistencia, el chat igual funciona
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      res.write(`data: ${JSON.stringify({ error: 'Timeout: la IA tardó demasiado' })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
    res.end();
  } finally {
    clearTimeout(timeout);
  }
});

app.post('/api/chat/save-message', async (req, res) => {
  const { agentId, sessionId, role, content, agentName } = req.body;
  if (!agentId || !sessionId || !role) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    return res.status(400).json({ error: 'IDs inválidos' });
  }
  try {
    const filePath = sessionFilePath(agentId, sessionId);
    try {
      await fs.access(filePath);
    } catch {
      await initSessionFile(agentId, sessionId, agentName || agentId);
    }
    if (role !== 'init' && content) {
      await appendToSessionFile(agentId, sessionId, role, content);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Modelos ──────────────────────────────────────────────────────────────
app.get('/api/models', async (_req, res) => {
  if (!process.env.GITHUB_TOKEN) {
    return res.json({ models: [], error: 'No configurado' });
  }
  try {
    const r = await fetch('https://models.inference.ai.azure.com/models', {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      return res.json({ models: [], error: `API error ${r.status}` });
    }
    const data = await r.json();
    // GitHub Models API returns an array directly — normalize to { models: [...] }
    const models = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    res.json({ models });
  } catch (err) {
    res.json({ models: [], error: err.message });
  }
});

// ── Jira ─────────────────────────────────────────────────────────────────
app.get('/api/jira/issues', async (req, res) => {
  const { jql } = req.query;
  if (!process.env.JIRA_URL || !process.env.JIRA_TOKEN) {
    return res.status(400).json({ error: 'Jira no configurado' });
  }
  try {
    const url = `${process.env.JIRA_URL}/rest/api/3/search?jql=${encodeURIComponent(jql || '')}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString('base64')}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jira/issues', async (req, res) => {
  const { project, summary, description, issueType } = req.body;
  if (!process.env.JIRA_URL || !process.env.JIRA_TOKEN) {
    return res.status(400).json({ error: 'Jira no configurado' });
  }
  try {
    const r = await fetch(`${process.env.JIRA_URL}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          project: { key: project || 'DEV' },
          summary: summary || 'Sin título',
          description: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: description || '' }] }],
          },
          issuetype: { name: issueType || 'Task' },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Upload ───────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No se subió archivo' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  let text = '';
  try {
    if (ext === '.txt' || ext === '.md') {
      text = await fs.readFile(req.file.path, 'utf8');
    } else if (ext === '.docx') {
      const buf = await fs.readFile(req.file.path);
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === '.pdf') {
      const { default: pdfParse } = await import('pdf-parse');
      const buf = await fs.readFile(req.file.path);
      text = (await pdfParse(buf)).text;
    } else {
      text = `[Archivo ${req.file.originalname} subido (${ext})]`;
    }
    await fs.unlink(req.file.path).catch(() => {});
    res.json({ text, filename: req.file.originalname });
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ── API 404 — catch unknown API routes (before SPA fallback) ──────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ── Fallback SPA ─────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'panel', 'index.html'));
});

// ── Error handling middleware ──────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

// ── Start ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`⚡ Control de Agentes v3.0`);
  console.log(`   http://localhost:${PORT}`);
  if (!process.env.GITHUB_TOKEN) {
    console.log(`   ⚠  GitHub Token no configurado — abrí el panel para configurarlo`);
  }
});
