import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import type { AppConfig } from './config.js';

export function createApp(config: AppConfig) {
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

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    void next;
    console.error(error);
    response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  };
  app.use(errorHandler);

  return app;
}
