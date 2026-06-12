import { promises as fs } from 'fs';
import path from 'path';
import { ROOT_DIR } from '../config.js';
import safePath from '../utils/safe-path.js';
import { writeFileAtomic } from '../utils/atomic-write.js';

export async function listSkills() {
  const dir = path.join(ROOT_DIR, 'config', 'skills');
  await fs.mkdir(dir, { recursive: true });
  return (await fs.readdir(dir)).filter(f => f.endsWith('.skill.md'));
}

export async function getSkill(name) {
  const content = await fs.readFile(safePath(ROOT_DIR, 'config', 'skills', name), 'utf8');
  return { name, content };
}

export async function createSkill(name, content) {
  if (!name || !content) throw Object.assign(new Error('Nombre y contenido requeridos'), { status: 400 });
  await writeFileAtomic(safePath(ROOT_DIR, 'config', 'skills', name), content);
  return { ok: true, name };
}
