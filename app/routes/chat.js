import { Router } from 'express';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import { ROOT_DIR } from '../config.js';
import { wrapRouter } from '../middleware/async-wrap.js';
import safePath from '../utils/safe-path.js';
import { sanitizeId } from '../utils/sanitize.js';
import * as sessionStore from '../services/session-store.js';

const router = wrapRouter(Router());

router.post('/chat', async (req, res) => {
  const { agentId, sessionId, messages, model, skills = [] } = req.body;

  if (!agentId || !messages || !model) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos' });
  }
  if (!process.env.GITHUB_TOKEN) {
    return res.status(401).json({ error: 'GitHub Token no configurado' });
  }

  let agent;
  try {
    const agentPath = safePath(ROOT_DIR, 'agents', `${agentId}.json`);
    agent = JSON.parse(await fs.readFile(agentPath, 'utf8'));
  } catch {
    return res.status(404).json({ error: 'Agente no encontrado' });
  }

  let systemPrompt = agent.systemPrompt || '';
  if (skills.length > 0) {
    const contents = await Promise.all(
      skills.map(async s => {
        try { return await fs.readFile(safePath(ROOT_DIR, 'config', 'skills', s), 'utf8'); }
        catch { return ''; }
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
      const lines = text.split('\n').filter(l => l.startsWith('data: '));
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
        } catch { }
      }
    }

    if (sessionId && fullContent) {
      try { await sessionStore.appendToSessionFile(agentId, sessionId, 'assistant', fullContent); }
      catch { }
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

router.post('/chat/save-message', async (req, res) => {
  const { agentId, sessionId, role, content, agentName } = req.body;
  if (!agentId || !sessionId || !role) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    return res.status(400).json({ error: 'IDs inválidos' });
  }
  try {
    const filePath = sessionStore.getSessionFilePath(agentId, sessionId);
    try { await fs.access(filePath); }
    catch { await sessionStore.initSessionFile(agentId, sessionId, agentName || agentId); }
    if (role !== 'init' && content) {
      await sessionStore.appendToSessionFile(agentId, sessionId, role, content);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
