import type { Pool } from 'pg';
import type { BookingTransition, Cancellation, CustomerBooking, HeldBooking, StatusHistoryEntry } from './types.js';
import { priceSeat } from '../domain/pricing.js';
import { refundAmountCents } from '../domain/refund.js';
import { transitionBooking } from '../domain/booking.js';

export class BookingError extends Error {
  constructor(public readonly code: 'EVENT_NOT_FOUND' | 'SEATS_NOT_AVAILABLE' | 'SEAT_NOT_IN_EVENT' | 'BOOKING_NOT_FOUND' | 'BOOKING_NOT_ACTIVE' | 'INVALID_TRANSITION') {
    super(code === 'EVENT_NOT_FOUND' ? 'Published event not found' : code === 'SEAT_NOT_IN_EVENT' ? 'One or more seats do not belong to this event' : code === 'BOOKING_NOT_FOUND' ? 'Booking not found' : code === 'BOOKING_NOT_ACTIVE' ? 'Booking is already cancelled or expired' : code === 'INVALID_TRANSITION' ? 'That booking status transition is not allowed' : 'One or more seats are already held or booked');
  }
}

type SeatRow = { id: string; row_label: string; seat_number: number; base_price_cents: number; current_booking_id: string | null; hold_expires_at: Date | null };

export class PgBookingRepository {
  constructor(private readonly pool: Pool) {}

  async holdSeats(customerId: string, eventId: string, seatIds: string[]): Promise<HeldBooking> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const event = await client.query<{ id: string; name: string; starts_at: Date; pricing_strategy: 'base' | 'early_bird' }>(
        `SELECT id, name, starts_at, pricing_strategy FROM events WHERE id = $1 AND status = 'published' AND starts_at > now()`, [eventId],
      );
      if (!event.rows[0]) throw new BookingError('EVENT_NOT_FOUND');
      const uniqueSeatIds = [...new Set(seatIds)].sort();
      const seats = await client.query<SeatRow>(
        `SELECT s.id, s.row_label, s.seat_number, c.base_price_cents, s.current_booking_id, s.hold_expires_at
         FROM event_seats s JOIN seat_categories c ON c.id = s.category_id
         WHERE s.event_id = $1 AND s.id = ANY($2::uuid[]) ORDER BY s.id FOR UPDATE`, [eventId, uniqueSeatIds],
      );
      if (seats.rowCount !== uniqueSeatIds.length) throw new BookingError('SEAT_NOT_IN_EVENT');
      const now = Date.now();
      if (seats.rows.some((seat) => seat.current_booking_id && (seat.hold_expires_at === null || seat.hold_expires_at.getTime() > now))) throw new BookingError('SEATS_NOT_AVAILABLE');
      const expiresAt = new Date(now + 5 * 60 * 1000);
      const pricedSeats = seats.rows.map((seat) => ({ ...seat, priceCents: priceSeat(event.rows[0]!.pricing_strategy, { basePriceCents: seat.base_price_cents, eventStartsAt: event.rows[0]!.starts_at, now: new Date(now) }) }));
      const totalCents = pricedSeats.reduce((total, seat) => total + seat.priceCents, 0);
      const booking = await client.query<{ id: string }>(
        `INSERT INTO bookings (event_id, customer_id, status, total_cents) VALUES ($1, $2, 'held', $3) RETURNING id`, [eventId, customerId, totalCents],
      );
      const bookingId = booking.rows[0]!.id;
      for (const seat of pricedSeats) {
        await client.query('INSERT INTO booking_seats (booking_id, event_seat_id, price_cents) VALUES ($1, $2, $3)', [bookingId, seat.id, seat.priceCents]);
        await client.query(`UPDATE event_seats SET current_booking_id = $1, hold_expires_at = $2, confirmed_at = NULL WHERE id = $3`, [bookingId, expiresAt, seat.id]);
      }
      await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, NULL, 'held')`, [bookingId]);
      await client.query('COMMIT');
      return { id: bookingId, eventId, customerId, status: 'held', totalCents, expiresAt: expiresAt.toISOString(), seats: pricedSeats.map((seat) => ({ id: seat.id, rowLabel: seat.row_label, seatNumber: seat.seat_number, priceCents: seat.priceCents })) };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async listCustomerBookings(customerId: string): Promise<CustomerBooking[]> {
    const result = await this.pool.query<CustomerBooking>(
      `SELECT b.id, b.event_id AS "eventId", b.customer_id AS "customerId", b.status, b.total_cents AS "totalCents",
              b.created_at + interval '5 minutes' AS "expiresAt", e.name AS "eventName", e.starts_at AS "startsAt",
              COALESCE(json_agg(json_build_object('id', s.id, 'rowLabel', s.row_label, 'seatNumber', s.seat_number, 'priceCents', bs.price_cents)) FILTER (WHERE s.id IS NOT NULL), '[]') AS seats
       FROM bookings b JOIN events e ON e.id = b.event_id LEFT JOIN booking_seats bs ON bs.booking_id = b.id LEFT JOIN event_seats s ON s.id = bs.event_seat_id
       WHERE b.customer_id = $1 GROUP BY b.id, e.name, e.starts_at ORDER BY b.created_at DESC`, [customerId],
    );
    return result.rows.map((booking) => ({ ...booking, startsAt: new Date(booking.startsAt).toISOString(), expiresAt: new Date(booking.expiresAt).toISOString() }));
  }

  async cancelBooking(customerId: string, bookingId: string): Promise<Cancellation> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string; status: 'held' | 'pending_payment' | 'confirmed' | 'expired' | 'cancelled'; total_cents: number; starts_at: Date }>(
        `SELECT b.id, b.status, b.total_cents, e.starts_at FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = $1 AND b.customer_id = $2 FOR UPDATE`, [bookingId, customerId],
      );
      const booking = result.rows[0];
      if (!booking) throw new BookingError('BOOKING_NOT_FOUND');
      if (booking.status !== 'held' && booking.status !== 'pending_payment' && booking.status !== 'confirmed') throw new BookingError('BOOKING_NOT_ACTIVE');
      const cancelledAt = new Date();
      const refundCents = booking.status === 'confirmed' ? refundAmountCents(booking.total_cents, booking.starts_at, cancelledAt) : 0;
      await client.query(`UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1`, [bookingId]);
      await client.query(`UPDATE event_seats SET current_booking_id = NULL, hold_expires_at = NULL, confirmed_at = NULL WHERE current_booking_id = $1`, [bookingId]);
      await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, $2, 'cancelled')`, [bookingId, booking.status]);
      await client.query('COMMIT');
      return { bookingId, status: 'cancelled', refundCents, cancelledAt: cancelledAt.toISOString() };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async transitionBooking(customerId: string, bookingId: string, toStatus: 'pending_payment' | 'confirmed'): Promise<BookingTransition> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ status: 'held' | 'pending_payment' | 'confirmed' | 'expired' | 'cancelled'; hold_expires_at: Date | null }>(
        'SELECT status, hold_expires_at FROM bookings WHERE id = $1 AND customer_id = $2 FOR UPDATE', [bookingId, customerId],
      );
      const booking = result.rows[0];
      if (!booking) throw new BookingError('BOOKING_NOT_FOUND');
      if (booking.hold_expires_at && booking.hold_expires_at.getTime() <= Date.now()) throw new BookingError('BOOKING_NOT_ACTIVE');
      try { transitionBooking(booking.status, toStatus); } catch { throw new BookingError('INVALID_TRANSITION'); }
      await client.query(`UPDATE bookings SET status = $2, updated_at = now() WHERE id = $1`, [bookingId, toStatus]);
      if (toStatus === 'confirmed') await client.query(`UPDATE event_seats SET hold_expires_at = NULL, confirmed_at = now() WHERE current_booking_id = $1`, [bookingId]);
      await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, $2, $3)`, [bookingId, booking.status, toStatus]);
      await client.query('COMMIT');
      return { bookingId, status: toStatus };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async expireHolds(): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const expired = await client.query<{ id: string; status: 'held' | 'pending_payment' }>(`SELECT id, status FROM bookings WHERE status IN ('held', 'pending_payment') AND hold_expires_at <= now() FOR UPDATE SKIP LOCKED`);
      for (const booking of expired.rows) {
        await client.query(`UPDATE bookings SET status = 'expired', updated_at = now() WHERE id = $1`, [booking.id]);
        await client.query(`UPDATE event_seats SET current_booking_id = NULL, hold_expires_at = NULL, confirmed_at = NULL WHERE current_booking_id = $1`, [booking.id]);
        await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, $2, 'expired')`, [booking.id, booking.status]);
      }
      await client.query('COMMIT');
      return expired.rowCount ?? 0;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async statusHistory(customerId: string, bookingId: string): Promise<StatusHistoryEntry[]> {
    const owner = await this.pool.query('SELECT 1 FROM bookings WHERE id = $1 AND customer_id = $2', [bookingId, customerId]);
    if (!owner.rowCount) throw new BookingError('BOOKING_NOT_FOUND');
    const result = await this.pool.query<StatusHistoryEntry>(`SELECT from_status AS "fromStatus", to_status AS "toStatus", changed_at AS "changedAt" FROM booking_status_history WHERE booking_id = $1 ORDER BY changed_at ASC, id ASC`, [bookingId]);
    return result.rows.map((entry) => ({ ...entry, changedAt: new Date(entry.changedAt).toISOString() }));
  }
}
