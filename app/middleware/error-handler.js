import { logger } from '../utils/logger.js';

export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Endpoint no encontrado' });
}

export function errorHandler(err, req, res, _next) {
  logger.error(err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
}
