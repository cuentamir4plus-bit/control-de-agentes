import express from 'express';
import morgan from 'morgan';
import path from 'path';
import { ROOT_DIR } from './config.js';
import { securityMiddleware } from './middleware/security.js';
import { apiNotFound, errorHandler } from './middleware/error-handler.js';
import configRoutes from './routes/config-routes.js';
import agentsRoutes from './routes/agents.js';
import skillsRoutes from './routes/skills.js';
import sessionsRoutes from './routes/sessions.js';
import chatRoutes from './routes/chat.js';
import modelsRoutes from './routes/models.js';
import jiraRoutes from './routes/jira.js';
import uploadRoutes from './routes/upload.js';
import statusRoutes from './routes/status.js';

const app = express();

app.use(securityMiddleware());
app.use(morgan(':method :url :status :response-time ms'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT_DIR, 'panel')));

app.use('/api', configRoutes);
app.use('/api', agentsRoutes);
app.use('/api', skillsRoutes);
app.use('/api', sessionsRoutes);
app.use('/api', chatRoutes);
app.use('/api', modelsRoutes);
app.use('/api', jiraRoutes);
app.use('/api', uploadRoutes);
app.use('/api', statusRoutes);

app.use('/api', apiNotFound);

app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'panel', 'index.html'));
});

app.use(errorHandler);

export default app;
