import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PgBookingRepository } from '../src/booking/repository.js';
import { PgPaymentRepository } from '../src/payment/repository.js';
import { PaymentService } from '../src/payment/service.js';
import { MockStripeProvider } from '../src/payment/providers.js';

const postgresTest = process.env.RUN_POSTGRES_TESTS === '1' ? test : test.skip;

postgresTest('payment retries are idempotent and an expired claim cannot be confirmed', async () => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required for PostgreSQL integration tests');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const organizerId = randomUUID();
  const firstCustomerId = randomUUID();
  const secondCustomerId = randomUUID();
  const venueId = randomUUID();
  const eventId = randomUUID();
  const categoryId = randomUUID();
  const firstSeatId = randomUUID();
  const secondSeatId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role) VALUES
       ($1, $2, 'test', 'organizer'), ($3, $4, 'test', 'customer'), ($5, $6, 'test', 'customer')`,
      [organizerId, `${organizerId}@test.invalid`, firstCustomerId, `${firstCustomerId}@test.invalid`, secondCustomerId, `${secondCustomerId}@test.invalid`],
    );
    await pool.query('INSERT INTO venues (id, organizer_id, name, city, address) VALUES ($1, $2, $3, $4, $5)', [venueId, organizerId, 'Payment Test Venue', 'Test City', 'Test Address']);
    await pool.query(
      `INSERT INTO events (id, organizer_id, venue_id, name, description, starts_at, ends_at, pricing_strategy, status)
       VALUES ($1, $2, $3, 'Payment Test Event', '', $4, $5, 'base', 'published')`,
      [eventId, organizerId, venueId, new Date(Date.now() + 86400000), new Date(Date.now() + 90000000)],
    );
    await pool.query('INSERT INTO seat_categories (id, event_id, name, base_price_cents) VALUES ($1, $2, $3, 2500)', [categoryId, eventId, 'General']);
    await pool.query(
      `INSERT INTO event_seats (id, event_id, category_id, row_label, seat_number)
       VALUES ($1, $3, $4, 'A', 1), ($2, $3, $4, 'A', 2)`,
      [firstSeatId, secondSeatId, eventId, categoryId],
    );

    const bookings = new PgBookingRepository(pool);
    const paymentRepository = new PgPaymentRepository(pool);
    const payments = new PaymentService(paymentRepository, [new MockStripeProvider()]);

    const confirmedHold = await bookings.holdSeats(firstCustomerId, eventId, [firstSeatId]);
    await bookings.transitionBooking(firstCustomerId, confirmedHold.id, 'pending_payment');
    const firstPayment = await payments.pay(firstCustomerId, confirmedHold.id, 'stripe', 'retry-key-123');
    const repeatedPayment = await payments.pay(firstCustomerId, confirmedHold.id, 'stripe', 'retry-key-123');
    assert.equal(firstPayment.status, 'succeeded');
    assert.deepEqual(repeatedPayment, firstPayment);
    const attempts = await pool.query<{ count: string }>('SELECT count(*) FROM payment_attempts WHERE booking_id = $1', [confirmedHold.id]);
    assert.equal(Number(attempts.rows[0]?.count), 1);

    const expiredHold = await bookings.holdSeats(firstCustomerId, eventId, [secondSeatId]);
    await bookings.transitionBooking(firstCustomerId, expiredHold.id, 'pending_payment');
    const pendingPayment = await paymentRepository.prepare(firstCustomerId, expiredHold.id, 'stripe', 'expiry-key-123');
    assert.equal(pendingPayment.shouldCharge, true);
    await pool.query("UPDATE event_seats SET hold_expires_at = now() - interval '1 second' WHERE id = $1", [secondSeatId]);
    await pool.query("UPDATE bookings SET created_at = now() - interval '6 minutes' WHERE id = $1", [expiredHold.id]);
    const replacementHold = await bookings.holdSeats(secondCustomerId, eventId, [secondSeatId]);

    const stalePayment = await paymentRepository.complete(pendingPayment.attempt, 'succeeded', 'mock-success');
    assert.equal(stalePayment.status, 'failed');
    const expiredCount = await bookings.expireHolds();
    assert.equal(expiredCount, 1);
    const oldBooking = await pool.query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [expiredHold.id]);
    const currentSeat = await pool.query<{ current_booking_id: string }>('SELECT current_booking_id FROM event_seats WHERE id = $1', [secondSeatId]);
    assert.equal(oldBooking.rows[0]?.status, 'expired');
    assert.equal(currentSeat.rows[0]?.current_booking_id, replacementHold.id);
  } finally {
    await pool.query('DELETE FROM notifications WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM payment_attempts WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM booking_status_history WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE event_id = $1)', [eventId]);
    await pool.query('DELETE FROM event_seats WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM bookings WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM seat_categories WHERE event_id = $1', [eventId]);
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
    await pool.query('DELETE FROM venues WHERE id = $1', [venueId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [organizerId, firstCustomerId, secondCustomerId]);
    await pool.end();
  }
});
