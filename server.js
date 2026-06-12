import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRS = ['agents', 'chats', 'outputs', 'config/skills', 'uploads'];
await Promise.all(DIRS.map((d) => fs.mkdir(path.join(__dirname, d), { recursive: true })));

const { default: app } = await import('./app/index.js');
const { PORT } = await import('./app/config.js');

const server = app.listen(PORT, () => {
  console.log(`⚡ Control de Agentes v3.0`);
  console.log(`   http://localhost:${PORT}`);
  if (!process.env.GITHUB_TOKEN) {
    console.log(`   ⚠  GitHub Token no configurado — abrí el panel para configurarlo`);
  }
});

function gracefulShutdown(signal) {
  console.log(`\n${signal} recibida — cerrando servidor...`);
  server.close(() => {
    console.log('Servidor cerrado.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
