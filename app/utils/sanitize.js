export function sanitizeId(id) {
  return /^[a-zA-Z0-9\-_]+$/.test(id);
}
