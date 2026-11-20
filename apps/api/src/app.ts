import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { AuthError, type AuthService } from './auth/service.js';
import { loginSchema, registerSchema, requireAuth } from './auth/http.js';

export function createApp(config: AppConfig, auth: AuthService) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '1mb' }));

  app.use((request, response, next) => {
    const started = Date.now();
    response.on('finish', () => {
      console.info(JSON.stringify({
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - started,
      }));
    });
    next();
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'ticketflow-api' });
  });

  app.post('/auth/register', async (request, response, next) => {
    try {
      const input = registerSchema.parse(request.body);
      response.status(201).json(await auth.register(input));
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/login', async (request, response, next) => {
    try {
      const input = loginSchema.parse(request.body);
      response.json(await auth.login(input));
    } catch (error) {
      next(error);
    }
  });

  app.get('/auth/me', requireAuth(config.authTokenSecret), (_request, response) => {
    const { sub, role } = response.locals.auth;
    response.json({ user: { id: sub, role } });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    void next;
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', issues: error.issues.map((issue) => ({ path: issue.path, message: issue.message })) } });
      return;
    }
    if (error instanceof AuthError) {
      response.status(error.code === 'EMAIL_TAKEN' ? 409 : 401).json({ error: { code: error.code, message: error.message } });
      return;
    }
    console.error(error);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  };
  app.use(errorHandler);

  return app;
}
