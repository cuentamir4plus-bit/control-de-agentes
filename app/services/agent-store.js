import { promises as fs } from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config.js';
import safePath from '../utils/safe-path.js';
import { writeFileAtomic } from '../utils/atomic-write.js';
import { sanitizeId } from '../utils/sanitize.js';

const cache = new Map();
const CACHE_TTL = 30_000;

function agentPath(id) {
  return safePath(ROOT_DIR, 'agents', `${id}.json`);
}

function agentsDir() {
  return path.join(ROOT_DIR, 'agents');
}

function invalidate(id) {
  cache.delete(id);
  cache.delete('__list');
}

export async function listAgents() {
  const cached = cache.get('__list');
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const dir = agentsDir();
  await fs.mkdir(dir, { recursive: true });
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.json'));
  const agents = (await Promise.all(
    files.map(async f => {
      try { return JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')); }
      catch { return null; }
    })
  )).filter(Boolean);

  cache.set('__list', { data: agents, ts: Date.now() });
  return agents;
}

export async function getAgent(id) {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const content = await fs.readFile(agentPath(id), 'utf8');
  const agent = JSON.parse(content);
  cache.set(id, { data: agent, ts: Date.now() });
  return agent;
}

export async function createAgent(body) {
  const { id, name, systemPrompt, icon, description, skills, model } = body;
  if (!id || !sanitizeId(id)) {
    throw Object.assign(new Error('ID inválido. Solo alfanumérico, guiones y guión bajo.'), { status: 400 });
  }
  if (!name) throw Object.assign(new Error('Nombre requerido'), { status: 400 });
  if (!systemPrompt) throw Object.assign(new Error('System prompt requerido'), { status: 400 });

  const agent = {
    id, name, icon: icon || '🤖', description: description || '',
    systemPrompt, skills: skills || [], model: model || 'gpt-4o-mini',
    createdAt: new Date().toISOString(),
  };

  await writeFileAtomic(agentPath(id), JSON.stringify(agent, null, 2));
  invalidate(id);
  return agent;
}

export async function updateAgent(id, body) {
  if (!sanitizeId(id)) throw Object.assign(new Error('ID inválido'), { status: 400 });
  const existing = JSON.parse(await fs.readFile(agentPath(id), 'utf8'));
  const updated = { ...existing, ...body, id };
  await writeFileAtomic(agentPath(id), JSON.stringify(updated, null, 2));
  invalidate(id);
  return updated;
}

export async function deleteAgent(id) {
  if (!sanitizeId(id)) throw Object.assign(new Error('ID inválido'), { status: 400 });
  await fs.unlink(agentPath(id));
  const chatDir = safePath(ROOT_DIR, 'chats', id);
  await fs.rm(chatDir, { recursive: true, force: true });
  invalidate(id);
}
