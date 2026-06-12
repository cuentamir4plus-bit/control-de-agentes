import fetch from 'node-fetch';

const API_BASE = 'https://models.inference.ai.azure.com';

export async function listModels() {
  if (!process.env.GITHUB_TOKEN) return { models: [], error: 'No configurado' };
  try {
    const r = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { models: [], error: `API error ${r.status}` };
    const data = await r.json();
    const models = Array.isArray(data) ? data
      : Array.isArray(data.data) ? data.data
      : Array.isArray(data.models) ? data.models
      : [];
    return { models };
  } catch (err) {
    return { models: [], error: err.message };
  }
}
