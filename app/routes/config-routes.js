import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { ROOT_DIR, PORT } from '../config.js';
import { wrapRouter } from '../middleware/async-wrap.js';
import { writeFileAtomic } from '../utils/atomic-write.js';

const router = wrapRouter(Router());

router.get('/config', (req, res) => {
  res.json({
    hasToken: !!process.env.GITHUB_TOKEN,
    port: PORT,
    jiraConfigured: !!(process.env.JIRA_URL && process.env.JIRA_TOKEN),
  });
});

router.post('/config', async (req, res) => {
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

  await writeFileAtomic(path.join(ROOT_DIR, '.env'), envContent);
  res.json({ ok: true });
});

router.get('/token-status', async (req, res) => {
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

export default router;
