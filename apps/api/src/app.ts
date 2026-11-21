import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { AuthError, type AuthService } from './auth/service.js';
import { loginSchema, registerSchema, requireAuth } from './auth/http.js';
import { createEventSchema, venueSchema } from './events/http.js';
import { EventError, EventService } from './events/service.js';

export function createApp(config: AppConfig, auth: AuthService, events?: EventService) {
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

  if (events) {
    const organizerAuth = requireAuth(config.authTokenSecret, 'organizer');
    app.post('/venues', organizerAuth, async (request, response, next) => {
      try {
        const input = venueSchema.parse(request.body);
        response.status(201).json({ venue: await events.createVenue(response.locals.auth.sub, input) });
      } catch (error) { next(error); }
    });

    app.get('/venues', organizerAuth, async (_request, response, next) => {
      try { response.json({ venues: await events.listVenues(response.locals.auth.sub) }); }
      catch (error) { next(error); }
    });

    app.post('/events/organizer', organizerAuth, async (request, response, next) => {
      try {
        const input = createEventSchema.parse(request.body);
        const categoryNames = new Map(input.categories.map((category) => [category.name.toLowerCase(), category.name]));
        const event = await events.createEvent({
          organizerId: response.locals.auth.sub,
          venueId: input.venueId,
          name: input.name,
          description: input.description,
          startsAt: input.startsAt,
          pricingStrategy: input.pricingStrategy,
          status: input.status,
          rows: input.seatMap.rows.map((row) => ({ label: row.label, category: categoryNames.get(row.category.toLowerCase())! })),
          seatsPerRow: input.seatMap.seatsPerRow,
          categories: input.categories,
        });
        response.status(201).json({ event });
      } catch (error) { next(error); }
    });

    app.get('/events/organizer', organizerAuth, async (_request, response, next) => {
      try { response.json({ events: await events.listOrganizerEvents(response.locals.auth.sub) }); }
      catch (error) { next(error); }
    });

    app.get('/events/organizer/:eventId', organizerAuth, async (request, response, next) => {
      try { response.json({ event: await events.getOrganizerEvent(response.locals.auth.sub, request.params.eventId!) }); }
      catch (error) { next(error); }
    });

    app.get('/events', async (_request, response, next) => {
      try { response.json({ events: await events.listPublishedEvents() }); }
      catch (error) { next(error); }
    });

    app.get('/events/:eventId', async (request, response, next) => {
      try { response.json({ event: await events.getPublishedEvent(request.params.eventId!) }); }
      catch (error) { next(error); }
    });
  }

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
    if (error instanceof EventError) {
      response.status(error.code === 'NOT_OWNER' ? 403 : 404).json({ error: { code: error.code, message: error.message } });
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
