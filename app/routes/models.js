import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import { listModels } from '../services/github-ai.js';

const router = wrapRouter(Router());

router.get('/models', async (req, res) => {
  const result = await listModels();
  res.json(result);
});

export default router;
