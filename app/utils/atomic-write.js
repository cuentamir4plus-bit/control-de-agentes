import { promises as fs } from 'fs';

export async function writeFileAtomic(filePath, content) {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, content, 'utf8');
  try { await fs.unlink(filePath); } catch { }
  await fs.rename(tmp, filePath);
}
