import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';

const corsMiddleware = cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

export function securityMiddleware() {
  return [
    helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
    corsMiddleware,
    limiter,
  ];
}
