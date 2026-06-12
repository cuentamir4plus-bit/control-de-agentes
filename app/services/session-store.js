import { promises as fs } from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config.js';
import safePath from '../utils/safe-path.js';
import { writeFileAtomic } from '../utils/atomic-write.js';
import { sanitizeId } from '../utils/sanitize.js';

function sessionFilePath(agentId, sessionId) {
  return safePath(ROOT_DIR, 'chats', agentId, `${sessionId}.md`);
}

export function getSessionFilePath(agentId, sessionId) {
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    throw Object.assign(new Error('IDs inválidos'), { status: 400 });
  }
  return sessionFilePath(agentId, sessionId);
}

export async function listSessions(agentId) {
  if (!sanitizeId(agentId)) throw Object.assign(new Error('ID inválido'), { status: 400 });
  const dir = safePath(ROOT_DIR, 'chats', agentId);
  try {
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.md'));
    const sessions = await Promise.all(
      files.map(async f => {
        const fullPath = path.join(dir, f);
        const stat = await fs.stat(fullPath);
        const fd = await fs.open(fullPath, 'r');
        const buf = Buffer.alloc(2048);
        const { bytesRead } = await fd.read(buf, 0, 2048, 0);
        await fd.close();
        const head = buf.toString('utf8', 0, bytesRead);
        const lines = head.split('\n').filter(Boolean);
        const preview = lines.slice(4, 10).join(' ').substring(0, 200);
        const sessionId = f.replace(/\.md$/, '');
        return { sessionId, fileName: f, date: stat.mtime.toISOString(), size: stat.size, preview };
      })
    );
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
    return sessions.slice(0, 20);
  } catch {
    return [];
  }
}

export async function getSession(agentId, sessionId) {
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    throw Object.assign(new Error('ID inválido'), { status: 400 });
  }
  const content = await fs.readFile(sessionFilePath(agentId, sessionId), 'utf8');
  return { agentId, sessionId, content };
}

export async function deleteSession(agentId, sessionId) {
  if (!sanitizeId(agentId) || !sanitizeId(sessionId)) {
    throw Object.assign(new Error('ID inválido'), { status: 400 });
  }
  await fs.unlink(sessionFilePath(agentId, sessionId));
  return { ok: true };
}

export async function initSessionFile(agentId, sessionId, agentName) {
  const dir = safePath(ROOT_DIR, 'chats', agentId);
  await fs.mkdir(dir, { recursive: true });
  const header = `# Chat — ${agentName}\n**Sesión:** ${sessionId}\n**Fecha:** ${new Date().toLocaleString('es-AR')}\n\n---\n\n`;
  await writeFileAtomic(sessionFilePath(agentId, sessionId), header);
}

export async function appendToSessionFile(agentId, sessionId, role, content) {
  const label = role === 'user' ? '**Usuario:**' : '**Agente:**';
  const ts = new Date().toLocaleTimeString('es-AR');
  const entry = `\n${label} *(${ts})*\n\n${content}\n\n---\n`;
  await fs.appendFile(sessionFilePath(agentId, sessionId), entry, 'utf8');
}

export function generateSessionId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
