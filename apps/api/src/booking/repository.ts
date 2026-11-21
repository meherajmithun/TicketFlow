import type { Pool } from 'pg';
import type { CustomerBooking, HeldBooking } from './types.js';

export class BookingError extends Error {
  constructor(public readonly code: 'EVENT_NOT_FOUND' | 'SEATS_NOT_AVAILABLE' | 'SEAT_NOT_IN_EVENT') {
    super(code === 'EVENT_NOT_FOUND' ? 'Published event not found' : code === 'SEAT_NOT_IN_EVENT' ? 'One or more seats do not belong to this event' : 'One or more seats are already held or booked');
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
      const totalCents = seats.rows.reduce((total, seat) => total + seat.base_price_cents, 0);
      const booking = await client.query<{ id: string }>(
        `INSERT INTO bookings (event_id, customer_id, status, total_cents) VALUES ($1, $2, 'held', $3) RETURNING id`, [eventId, customerId, totalCents],
      );
      const bookingId = booking.rows[0]!.id;
      for (const seat of seats.rows) {
        await client.query('INSERT INTO booking_seats (booking_id, event_seat_id, price_cents) VALUES ($1, $2, $3)', [bookingId, seat.id, seat.base_price_cents]);
        await client.query(`UPDATE event_seats SET current_booking_id = $1, hold_expires_at = $2, confirmed_at = NULL WHERE id = $3`, [bookingId, expiresAt, seat.id]);
      }
      await client.query(`INSERT INTO booking_status_history (booking_id, from_status, to_status) VALUES ($1, NULL, 'held')`, [bookingId]);
      await client.query('COMMIT');
      return { id: bookingId, eventId, customerId, status: 'held', totalCents, expiresAt: expiresAt.toISOString(), seats: seats.rows.map((seat) => ({ id: seat.id, rowLabel: seat.row_label, seatNumber: seat.seat_number, priceCents: seat.base_price_cents })) };
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
}
