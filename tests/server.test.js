import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../app/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let server;
let baseUrl;
let originalEnv;

before(async () => {
  const envPath = path.join(ROOT, '.env');
  try { originalEnv = await fs.readFile(envPath, 'utf8'); }
  catch { originalEnv = ''; }

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  const artifacts = [
    path.join(ROOT, 'agents', 'test-agent.json'),
    path.join(ROOT, 'config', 'skills', 'test-skill.skill.md'),
  ];
  for (const f of artifacts) {
    try { await fs.unlink(f); } catch { /* ok */ }
  }
  try { await fs.rm(path.join(ROOT, 'chats', 'test-agent'), { recursive: true, force: true }); } catch { /* ok */ }

  if (originalEnv) {
    const envPath = path.join(ROOT, '.env');
    try { await fs.writeFile(envPath, originalEnv, 'utf8'); } catch { /* ok */ }
  }

  await new Promise(resolve => server.close(resolve));
});

function api(p) {
  return `${baseUrl}/api${p}`;
}

async function get(p) {
  const res = await fetch(api(p));
  return { status: res.status, body: await res.json() };
}

async function post(p, body) {
  const res = await fetch(api(p), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function del(p) {
  const res = await fetch(api(p), { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

describe('API endpoints', () => {

  it('GET /api/config — returns config object', async () => {
    const { status, body } = await get('/config');
    assert.strictEqual(status, 200);
    assert.ok('hasToken' in body);
    assert.ok('port' in body);
    assert.ok('jiraConfigured' in body);
  });

  it('GET /api/agents — returns array', async () => {
    const { status, body } = await get('/agents');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
  });

  it('POST /api/agents — creates an agent and GET returns it', async () => {
    const { status, body } = await post('/agents', {
      id: 'test-agent',
      name: 'Test Agent',
      systemPrompt: 'Eres un agente de prueba.',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.id, 'test-agent');
    assert.strictEqual(body.name, 'Test Agent');

    const { body: list } = await get('/agents');
    const found = list.find(a => a.id === 'test-agent');
    assert.ok(found);
    assert.strictEqual(found.name, 'Test Agent');
  });

  it('DELETE /api/agents/:id — removes the agent', async () => {
    const { status, body } = await del('/agents/test-agent');
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { ok: true });

    const { body: list } = await get('/agents');
    assert.strictEqual(list.find(a => a.id === 'test-agent'), undefined);
  });

  it('GET /api/skills — returns array', async () => {
    const { status, body } = await get('/skills');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
  });

  it('POST /api/skills — creates a skill, then GET returns it', async () => {
    const { status, body } = await post('/skills', {
      name: 'test-skill.skill.md',
      content: '# Test Skill\n\nUna skill de prueba.',
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.ok, true);

    const { body: list } = await get('/skills');
    assert.ok(list.includes('test-skill.skill.md'));
  });

  it('GET /api/models — returns { models, error? }', async () => {
    const { status, body } = await get('/models');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body.models));
  });

  it('GET /api/chats/nonexistent — returns empty array', async () => {
    const { status, body } = await get('/chats/nonexistent');
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 0);
  });

  it('POST /api/config — updates token', async () => {
    const { status, body } = await post('/config', {
      token: 'github_pat_test123',
    });
    assert.strictEqual(status, 200);
    assert.deepStrictEqual(body, { ok: true });
  });

  it('GET /api/token-status — returns invalid because token not valid', async () => {
    const { status, body } = await get('/token-status');
    assert.strictEqual(status, 200);
    assert.strictEqual(body.valid, false);
    assert.ok(body.error || body.status);
  });

});
