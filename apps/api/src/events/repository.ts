import type { Pool } from 'pg';
import type { CreateEventInput, CreateVenueInput, Event, EventPage, EventSearch, Venue } from './types.js';
export type { CreateEventInput, CreateVenueInput } from './types.js';

export interface EventRepository {
  createVenue(organizerId: string, input: CreateVenueInput): Promise<Venue>;
  listVenues(organizerId: string): Promise<Venue[]>;
  createEvent(input: CreateEventInput): Promise<Event>;
  listOrganizerEvents(organizerId: string): Promise<Event[]>;
  findOrganizerEvent(organizerId: string, eventId: string): Promise<Event | null>;
  updateEventStatus(organizerId: string, eventId: string, status: 'published' | 'cancelled'): Promise<Event | null>;
  listPublishedEvents(search: EventSearch): Promise<EventPage>;
  findPublishedEvent(eventId: string): Promise<Event | null>;
}

type EventRow = {
  id: string; organizer_id: string; venue_id: string; venue_name: string; city: string; address: string;
  name: string; description: string; starts_at: Date; pricing_strategy: Event['pricingStrategy']; status: Event['status'];
};
type CategoryRow = { id: string; name: string; base_price_cents: number };
type SeatRow = { id: string; row_label: string; seat_number: number; category_id: string; category_name: string; base_price_cents: number; current_booking_id: string | null; hold_expires_at: Date | null };

function mapEvent(row: EventRow, categories: CategoryRow[], seats: SeatRow[]): Event {
  const now = Date.now();
  return {
    id: row.id,
    organizerId: row.organizer_id,
    venue: { id: row.venue_id, organizerId: row.organizer_id, name: row.venue_name, city: row.city, address: row.address },
    name: row.name,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    pricingStrategy: row.pricing_strategy,
    status: row.status,
    categories: categories.map((category) => ({ id: category.id, name: category.name, basePriceCents: category.base_price_cents })),
    seats: seats.map((seat) => ({
      id: seat.id,
      rowLabel: seat.row_label,
      seatNumber: seat.seat_number,
      categoryId: seat.category_id,
      categoryName: seat.category_name,
      basePriceCents: seat.base_price_cents,
      available: !seat.current_booking_id || (seat.hold_expires_at?.getTime() ?? 0) <= now,
    })),
  };
}

export class PgEventRepository implements EventRepository {
  constructor(private readonly pool: Pool) {}

  async createVenue(organizerId: string, input: CreateVenueInput): Promise<Venue> {
    const result = await this.pool.query<Venue>(
      `INSERT INTO venues (organizer_id, name, city, address) VALUES ($1, $2, $3, $4)
       RETURNING id, organizer_id AS "organizerId", name, city, address`,
      [organizerId, input.name, input.city, input.address],
    );
    return result.rows[0]!;
  }

  async listVenues(organizerId: string): Promise<Venue[]> {
    const result = await this.pool.query<Venue>(
      `SELECT id, organizer_id AS "organizerId", name, city, address FROM venues WHERE organizer_id = $1 ORDER BY created_at DESC`,
      [organizerId],
    );
    return result.rows;
  }

  async createEvent(input: CreateEventInput): Promise<Event> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const eventResult = await client.query<EventRow>(
        `INSERT INTO events (organizer_id, venue_id, name, description, starts_at, pricing_strategy, status)
         SELECT $1, id, $3, $4, $5, $6, $7 FROM venues WHERE id = $2 AND organizer_id = $1
         RETURNING id, organizer_id, venue_id, name, description, starts_at, pricing_strategy, status,
           (SELECT name FROM venues WHERE venues.id = events.venue_id) AS venue_name,
           (SELECT city FROM venues WHERE venues.id = events.venue_id) AS city,
           (SELECT address FROM venues WHERE venues.id = events.venue_id) AS address`,
        [input.organizerId, input.venueId, input.name, input.description, input.startsAt, input.pricingStrategy, input.status],
      );
      if (!eventResult.rows[0]) throw new Error('VENUE_NOT_FOUND_OR_NOT_OWNED');
      const event = eventResult.rows[0];
      const categories = new Map<string, CategoryRow>();
      for (const category of input.categories) {
        const result = await client.query<CategoryRow>(
          `INSERT INTO seat_categories (event_id, name, base_price_cents) VALUES ($1, $2, $3) RETURNING id, name, base_price_cents`,
          [event.id, category.name, category.basePriceCents],
        );
        categories.set(category.name, result.rows[0]!);
      }
      for (const row of input.rows) {
        const category = categories.get(row.category);
        if (!category) throw new Error('CATEGORY_NOT_FOUND');
        for (let seatNumber = 1; seatNumber <= input.seatsPerRow; seatNumber += 1) {
          await client.query(
            `INSERT INTO event_seats (event_id, category_id, row_label, seat_number) VALUES ($1, $2, $3, $4)`,
            [event.id, category.id, row.label, seatNumber],
          );
        }
      }
      await client.query('COMMIT');
      return (await this.findById(event.id))!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async listOrganizerEvents(organizerId: string): Promise<Event[]> {
    return this.findMany('e.organizer_id = $1', [organizerId]);
  }

  async findOrganizerEvent(organizerId: string, eventId: string): Promise<Event | null> {
    const events = await this.findMany('e.organizer_id = $1 AND e.id = $2', [organizerId, eventId]);
    return events[0] ?? null;
  }

  async updateEventStatus(organizerId: string, eventId: string, status: 'published' | 'cancelled'): Promise<Event | null> {
    const result = await this.pool.query('UPDATE events SET status = $3 WHERE organizer_id = $1 AND id = $2', [organizerId, eventId, status]);
    if (!result.rowCount) return null;
    return this.findOrganizerEvent(organizerId, eventId);
  }

  async listPublishedEvents(search: EventSearch): Promise<EventPage> {
    const filters = ["e.status = 'published'", 'e.starts_at > now()'];
    const params: unknown[] = [];
    if (search.query) { params.push(`%${search.query}%`); filters.push(`(e.name ILIKE $${params.length} OR e.description ILIKE $${params.length} OR v.name ILIKE $${params.length} OR v.city ILIKE $${params.length})`); }
    if (search.city) { params.push(`%${search.city}%`); filters.push(`v.city ILIKE $${params.length}`); }
    if (search.date) { params.push(search.date); filters.push(`e.starts_at::date = $${params.length}::date`); }
    const count = await this.pool.query<{ count: string }>(`SELECT count(*) FROM events e JOIN venues v ON v.id = e.venue_id WHERE ${filters.join(' AND ')}`, params);
    const total = Number(count.rows[0]?.count ?? 0);
    const limitPlaceholder = params.length + 1;
    const offsetPlaceholder = params.length + 2;
    params.push(search.pageSize, (search.page - 1) * search.pageSize);
    const events = await this.findMany(filters.join(' AND '), params, `LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`);
    return { events, total, page: search.page, pageSize: search.pageSize, totalPages: Math.ceil(total / search.pageSize) };
  }

  async findPublishedEvent(eventId: string): Promise<Event | null> {
    const events = await this.findMany("e.status = 'published' AND e.starts_at > now() AND e.id = $1", [eventId]);
    return events[0] ?? null;
  }

  private async findById(eventId: string): Promise<Event | null> {
    const events = await this.findMany('e.id = $1', [eventId]);
    return events[0] ?? null;
  }

  private async findMany(where: string, params: unknown[], pagination = ''): Promise<Event[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT e.id, e.organizer_id, e.venue_id, v.name AS venue_name, v.city, v.address,
              e.name, e.description, e.starts_at, e.pricing_strategy, e.status
       FROM events e JOIN venues v ON v.id = e.venue_id WHERE ${where} ORDER BY e.starts_at ASC ${pagination}`, params,
    );
    const events: Event[] = [];
    for (const row of result.rows) {
      const [categories, seats] = await Promise.all([
        this.pool.query<CategoryRow>('SELECT id, name, base_price_cents FROM seat_categories WHERE event_id = $1 ORDER BY base_price_cents, name', [row.id]),
        this.pool.query<SeatRow>(
          `SELECT s.id, s.row_label, s.seat_number, s.category_id, c.name AS category_name,
                  c.base_price_cents, s.current_booking_id, s.hold_expires_at
           FROM event_seats s JOIN seat_categories c ON c.id = s.category_id
           WHERE s.event_id = $1 ORDER BY s.row_label, s.seat_number`, [row.id],
        ),
      ]);
      events.push(mapEvent(row, categories.rows, seats.rows));
    }
    return events;
  }
}
