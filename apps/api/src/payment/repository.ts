import type { Pool } from 'pg';
import type { PaymentProviderName } from './providers.js';

export type PaymentAttempt = { bookingId: string; provider: PaymentProviderName; idempotencyKey: string; status: 'pending' | 'succeeded' | 'failed' | 'refunded'; amountCents: number; providerReference: string | null };
export type PaymentContext = { bookingId: string; amountCents: number };

export class PaymentError extends Error {
  constructor(public readonly code: 'BOOKING_NOT_FOUND' | 'BOOKING_NOT_PAYABLE' | 'PAYMENT_NOT_FOUND') {
    super(code === 'BOOKING_NOT_FOUND' ? 'Booking not found' : code === 'BOOKING_NOT_PAYABLE' ? 'Booking must be pending payment' : 'Payment attempt not found');
  }
}

export class PgPaymentRepository {
  constructor(private readonly pool: Pool) {}

  async prepare(customerId: string, bookingId: string, provider: PaymentProviderName, idempotencyKey: string): Promise<{ attempt: PaymentAttempt; shouldCharge: boolean; context?: PaymentContext }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const booking = await client.query<{ id: string; total_cents: number }>(`SELECT id, total_cents FROM bookings WHERE id = $1 AND customer_id = $2 AND status = 'pending_payment' FOR UPDATE`, [bookingId, customerId]);
      if (!booking.rows[0]) {
        const exists = await client.query('SELECT 1 FROM bookings WHERE id = $1 AND customer_id = $2', [bookingId, customerId]);
        throw new PaymentError(exists.rowCount ? 'BOOKING_NOT_PAYABLE' : 'BOOKING_NOT_FOUND');
      }
      const existing = await client.query<PaymentAttempt>(`SELECT booking_id AS "bookingId", provider, idempotency_key AS "idempotencyKey", status, amount_cents AS "amountCents", provider_reference AS "providerReference" FROM payment_attempts WHERE booking_id = $1 AND idempotency_key = $2 FOR UPDATE`, [bookingId, idempotencyKey]);
      if (existing.rows[0]) { await client.query('COMMIT'); return { attempt: existing.rows[0], shouldCharge: false }; }
      const inserted = await client.query<PaymentAttempt>(`INSERT INTO payment_attempts (booking_id, provider, idempotency_key, status, amount_cents) VALUES ($1, $2, $3, 'pending', $4) RETURNING booking_id AS "bookingId", provider, idempotency_key AS "idempotencyKey", status, amount_cents AS "amountCents", provider_reference AS "providerReference"`, [bookingId, provider, idempotencyKey, booking.rows[0].total_cents]);
      await client.query('COMMIT');
      return { attempt: inserted.rows[0]!, shouldCharge: true, context: { bookingId, amountCents: booking.rows[0].total_cents } };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async complete(attempt: PaymentAttempt, status: 'succeeded' | 'failed', providerReference: string | null): Promise<PaymentAttempt> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<PaymentAttempt>(`SELECT booking_id AS "bookingId", provider, idempotency_key AS "idempotencyKey", status, amount_cents AS "amountCents", provider_reference AS "providerReference" FROM payment_attempts WHERE booking_id = $1 AND idempotency_key = $2 FOR UPDATE`, [attempt.bookingId, attempt.idempotencyKey]);
      if (!locked.rows[0]) throw new PaymentError('PAYMENT_NOT_FOUND');
      if (locked.rows[0].status !== 'pending') { await client.query('COMMIT'); return locked.rows[0]; }
      const result = await client.query<PaymentAttempt>(`UPDATE payment_attempts SET status = $3, provider_reference = $4 WHERE booking_id = $1 AND idempotency_key = $2 RETURNING booking_id AS "bookingId", provider, idempotency_key AS "idempotencyKey", status, amount_cents AS "amountCents", provider_reference AS "providerReference"`, [attempt.bookingId, attempt.idempotencyKey, status, providerReference]);
      if (status === 'succeeded') {
        await client.query(`UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = $1 AND status = 'pending_payment'`, [attempt.bookingId]);
        await client.query(`UPDATE event_seats SET hold_expires_at = NULL, confirmed_at = now() WHERE current_booking_id = $1`, [attempt.bookingId]);
        await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, 'pending_payment', 'confirmed')`, [attempt.bookingId]);
      }
      await client.query('COMMIT');
      return result.rows[0]!;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}
