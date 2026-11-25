import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { AuthError, type AuthService } from './auth/service.js';
import { loginSchema, registerSchema, requireAuth } from './auth/http.js';
import { createEventSchema, eventSearchSchema, eventStatusSchema, updateEventSchema, venueSchema } from './events/http.js';
import { EventError, EventService } from './events/service.js';
import { holdSeatsSchema } from './booking/http.js';
import { BookingError, BookingService } from './booking/service.js';
import { paySchema } from './payment/http.js';
import { PaymentError, PaymentService } from './payment/service.js';
import { NotificationService } from './notification/service.js';
import { createRateLimiter } from './rate-limit.js';

export function createApp(config: AppConfig, auth: AuthService, events?: EventService, bookings?: BookingService, payments?: PaymentService, notifications?: NotificationService) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.clientOrigin }));
  app.use(express.json({ limit: '3mb' }));

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

  const authRateLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60_000 });
  app.post('/auth/register', authRateLimit, async (request, response, next) => {
    try {
      const input = registerSchema.parse(request.body);
      response.status(201).json(await auth.register(input));
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/login', authRateLimit, async (request, response, next) => {
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

    app.patch('/venues/:venueId', organizerAuth, async (request, response, next) => { try { const input = venueSchema.parse(request.body); response.json({ venue: await events.updateVenue({ ...input, venueId: request.params.venueId!, organizerId: response.locals.auth.sub }) }); } catch (error) { next(error); } });
    app.delete('/venues/:venueId', organizerAuth, async (request, response, next) => { try { await events.deleteVenue(response.locals.auth.sub, request.params.venueId!); response.status(204).send(); } catch (error) { next(error); } });

    app.post('/events/organizer', organizerAuth, async (request, response, next) => {
      try {
        const input = createEventSchema.parse(request.body);
        const categoryNames = new Map(input.categories.map((category) => [category.name.toLowerCase(), category.name]));
        const event = await events.createEvent({
          organizerId: response.locals.auth.sub,
          venueId: input.venueId,
          name: input.name,
          description: input.description,
          posterUrl: input.posterUrl,
          highlights: input.highlights,
          category: input.category,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
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

    app.patch('/events/organizer/:eventId', organizerAuth, async (request, response, next) => {
      try {
        const input = updateEventSchema.parse(request.body);
        const categoryNames = new Map(input.categories.map((category) => [category.name.toLowerCase(), category.name]));
        response.json({ event: await events.updateEvent({ eventId: request.params.eventId!, organizerId: response.locals.auth.sub, venueId: input.venueId, name: input.name, description: input.description, posterUrl: input.posterUrl, highlights: input.highlights, category: input.category, startsAt: input.startsAt, endsAt: input.endsAt, pricingStrategy: input.pricingStrategy, status: input.status, rows: input.seatMap.rows.map((row) => ({ label: row.label, category: categoryNames.get(row.category.toLowerCase())! })), seatsPerRow: input.seatMap.seatsPerRow, categories: input.categories }) });
      } catch (error) { next(error); }
    });

    app.patch('/events/organizer/:eventId/status', organizerAuth, async (request, response, next) => {
      try {
        const input = eventStatusSchema.parse(request.body);
        response.json({ event: await events.updateEventStatus(response.locals.auth.sub, request.params.eventId!, input.status) });
      } catch (error) { next(error); }
    });

    app.get('/events', async (_request, response, next) => {
      try {
        const search = eventSearchSchema.parse(_request.query);
        response.json(await events.listPublishedEvents({ query: search.q, city: search.city, date: search.date, past: search.past, status: search.status, category: search.category, sort: search.sort, page: search.page, pageSize: search.pageSize }));
      }
      catch (error) { next(error); }
    });

    app.get('/events/:eventId', async (request, response, next) => {
      try { response.json({ event: await events.getPublishedEvent(request.params.eventId!) }); }
      catch (error) { next(error); }
    });
  }

  if (bookings) {
    const customerAuth = requireAuth(config.authTokenSecret, 'customer');
    app.post('/bookings/holds', customerAuth, async (request, response, next) => {
      try {
        const input = holdSeatsSchema.parse(request.body);
        response.status(201).json({ booking: await bookings.holdSeats(response.locals.auth.sub, input.eventId, input.seatIds) });
      } catch (error) { next(error); }
    });
    app.get('/bookings', customerAuth, async (_request, response, next) => {
      try { response.json({ bookings: await bookings.listCustomerBookings(response.locals.auth.sub) }); }
      catch (error) { next(error); }
    });
    app.post('/bookings/:bookingId/cancel', customerAuth, async (request, response, next) => {
      try {
        const cancellation = await bookings.cancelBooking(response.locals.auth.sub, request.params.bookingId!);
        if (notifications) await notifications.publish({ userId: response.locals.auth.sub, bookingId: cancellation.bookingId, type: 'booking_cancelled', message: 'Your booking has been cancelled.' });
        response.json({ cancellation });
      }
      catch (error) { next(error); }
    });
    app.post('/bookings/:bookingId/payment', customerAuth, async (request, response, next) => {
      try { response.json({ booking: await bookings.transitionBooking(response.locals.auth.sub, request.params.bookingId!, 'pending_payment') }); }
      catch (error) { next(error); }
    });
    app.get('/bookings/:bookingId/history', customerAuth, async (request, response, next) => {
      try { response.json({ history: await bookings.statusHistory(response.locals.auth.sub, request.params.bookingId!) }); }
      catch (error) { next(error); }
    });
  }

  if (payments) {
    const customerAuth = requireAuth(config.authTokenSecret, 'customer');
    app.post('/bookings/:bookingId/pay', customerAuth, async (request, response, next) => {
      try {
        const input = paySchema.parse(request.body);
        const payment = await payments.pay(response.locals.auth.sub, request.params.bookingId!, input.provider, input.idempotencyKey);
        if (payment.status === 'succeeded' && notifications) await notifications.publish({ userId: response.locals.auth.sub, bookingId: payment.bookingId, type: 'booking_confirmed', message: 'Your payment was successful and your booking is confirmed.' });
        response.json({ payment });
      } catch (error) { next(error); }
    });
  }

  if (notifications) {
    const customerAuth = requireAuth(config.authTokenSecret, 'customer');
    app.get('/notifications', customerAuth, async (request, response, next) => {
      try { response.json({ notifications: await notifications.listForUser(response.locals.auth.sub) }); }
      catch (error) { next(error); }
    });
    app.post('/notifications/:notificationId/read', customerAuth, async (request, response, next) => {
      try { response.json({ read: await notifications.markRead(response.locals.auth.sub, request.params.notificationId!) }); }
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
      response.status(error.code === 'NOT_OWNER' ? 403 : error.code === 'EVENT_HAS_BOOKINGS' || error.code === 'VENUE_IN_USE' ? 409 : 404).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof BookingError) {
      response.status(error.code === 'SEATS_NOT_AVAILABLE' || error.code === 'BOOKING_NOT_ACTIVE' || error.code === 'INVALID_TRANSITION' ? 409 : 404).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof PaymentError) {
      response.status(error.code === 'BOOKING_NOT_PAYABLE' ? 409 : 404).json({ error: { code: error.code, message: error.message } });
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
