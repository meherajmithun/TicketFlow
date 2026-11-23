import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { BookingError, PgBookingRepository } from '../src/booking/repository.js';

const postgresTest = process.env.RUN_POSTGRES_TESTS === '1' ? test : test.skip;

postgresTest('PostgreSQL row locking allows only one customer to hold the same seat', async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString: databaseUrl });
  const organizerId = randomUUID();
  const firstCustomerId = randomUUID();
  const secondCustomerId = randomUUID();
  const venueId = randomUUID();
  const eventId = randomUUID();
  const categoryId = randomUUID();
  const seatId = randomUUID();

  try {
    await pool.query('BEGIN');
    await pool.query(`INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'integration-test', 'organizer'), ($3, $4, 'integration-test', 'customer'), ($5, $6, 'integration-test', 'customer')`, [organizerId, `${organizerId}@test.invalid`, firstCustomerId, `${firstCustomerId}@test.invalid`, secondCustomerId, `${secondCustomerId}@test.invalid`]);
    await pool.query('INSERT INTO venues (id, organizer_id, name, city, address) VALUES ($1, $2, $3, $4, $5)', [venueId, organizerId, 'Race Test Venue', 'Test City', 'Test Address']);
    await pool.query(`INSERT INTO events (id, organizer_id, venue_id, name, description, starts_at, ends_at, pricing_strategy, status) VALUES ($1, $2, $3, 'Race Test Event', '', '2099-01-01T18:00:00Z', '2099-01-01T21:00:00Z', 'base', 'published')`, [eventId, organizerId, venueId]);
    await pool.query('INSERT INTO seat_categories (id, event_id, name, base_price_cents) VALUES ($1, $2, $3, $4)', [categoryId, eventId, 'General', 2500]);
    await pool.query('INSERT INTO event_seats (id, event_id, category_id, row_label, seat_number) VALUES ($1, $2, $3, $4, $5)', [seatId, eventId, categoryId, 'A', 1]);
    await pool.query('COMMIT');

    const bookings = new PgBookingRepository(pool);
    const attempts = await Promise.allSettled([
      bookings.holdSeats(firstCustomerId, eventId, [seatId]),
      bookings.holdSeats(secondCustomerId, eventId, [seatId]),
    ]);
    const successful = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected');
    assert.equal(successful.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof BookingError);
    assert.equal(rejected[0].reason.code, 'SEATS_NOT_AVAILABLE');
  } finally {
    await pool.query('ROLLBACK').catch(() => undefined);
    await pool.query('DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM payment_attempts WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM notifications WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM event_seats WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM bookings WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [organizerId, firstCustomerId, secondCustomerId]);
    await pool.end();
  }
});
