import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import * as store from '../services/session-store.js';

const router = wrapRouter(Router());

router.get('/chats/:agentId', async (req, res) => {
  const sessions = await store.listSessions(req.params.agentId);
  res.json(sessions);
});

router.get('/chats/:agentId/:sessionId', async (req, res) => {
  const session = await store.getSession(req.params.agentId, req.params.sessionId);
  res.json(session);
});

router.get('/chats/:agentId/:sessionId/export', async (req, res) => {
  const format = req.query.format || 'md';
  if (format !== 'md') {
    return res.status(400).json({ error: 'Formato no soportado. Solo md disponible.' });
  }
  const session = await store.getSession(req.params.agentId, req.params.sessionId);
  const fileName = `${req.params.agentId}-${req.params.sessionId}.md`;
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(session.content);
});

router.delete('/chats/:agentId/:sessionId', async (req, res) => {
  const result = await store.deleteSession(req.params.agentId, req.params.sessionId);
  res.json(result);
});

export default router;
