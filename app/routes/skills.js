import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import * as store from '../services/skill-store.js';

const router = wrapRouter(Router());

router.get('/skills', async (req, res) => {
  const files = await store.listSkills();
  res.json(files);
});

router.get('/skills/:name', async (req, res) => {
  const skill = await store.getSkill(req.params.name);
  res.json(skill);
});

router.post('/skills', async (req, res) => {
  const { name, content } = req.body;
  const result = await store.createSkill(name, content);
  res.json(result);
});

export default router;
