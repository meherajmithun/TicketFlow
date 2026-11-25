import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Role } from './service.js';
import { verifyToken } from './token.js';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(12).max(128),
  role: z.literal('customer').optional(),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string(),
}).strict();

export function requireAuth(secret: string, role?: Role): RequestHandler {
  return (request, response, next) => {
    const header = request.get('authorization');
    const match = /^Bearer (\S+)$/i.exec(header ?? '');
    const claims = match ? verifyToken(match[1]!, secret) : null;
    if (!claims) {
      response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid bearer token required' } });
      return;
    }
    if (role && claims.role !== role) {
      response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
      return;
    }
    response.locals.auth = claims;
    next();
  };
}
