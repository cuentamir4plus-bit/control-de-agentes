import { Router } from 'express';
import { wrapRouter } from '../middleware/async-wrap.js';
import { promises as fs } from 'fs';
import safePath from '../utils/safe-path.js';
import { ROOT_DIR } from '../config.js';

const router = wrapRouter(Router());

router.get('/status', async (req, res) => {
  let agentsCount = 0;
  try {
    const agentsDir = safePath(ROOT_DIR, 'agents');
    const files = await fs.readdir(agentsDir);
    agentsCount = files.filter(f => f.endsWith('.json')).length;
  } catch {
    // agents dir may not exist yet
  }

  res.json({
    uptime: process.uptime(),
    version: '3.0.0',
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
    agentsCount,
  });
});

export default router;
