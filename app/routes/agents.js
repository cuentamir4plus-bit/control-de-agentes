import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import * as store from '../services/agent-store.js';

const router = wrapRouter(Router());

router.get('/agents', async (req, res) => {
  const agents = await store.listAgents();
  res.json(agents);
});

router.post('/agents', async (req, res) => {
  const agent = await store.createAgent(req.body);
  res.json(agent);
});

router.put('/agents/:id', async (req, res) => {
  const updated = await store.updateAgent(req.params.id, req.body);
  res.json(updated);
});

router.delete('/agents/:id', async (req, res) => {
  await store.deleteAgent(req.params.id);
  res.json({ ok: true });
});

export default router;
