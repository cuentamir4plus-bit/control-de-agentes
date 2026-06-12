import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import fetch from 'node-fetch';

const router = wrapRouter(Router());

router.get('/jira/issues', async (req, res) => {
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
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/jira/issues', async (req, res) => {
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
          description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description || '' }] }] },
          issuetype: { name: issueType || 'Task' },
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    res.json(await r.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
