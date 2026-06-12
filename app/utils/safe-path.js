import path from 'path';

export default function safePath(base, ...parts) {
  const resolved = path.resolve(base, ...parts);
  const baseResolved = path.resolve(base);
  const relative = path.relative(baseResolved, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal detectado');
  }
  return resolved;
}
