import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { AuthService, type User, type UserRepository } from '../src/auth/service.js';
import { signToken } from '../src/auth/token.js';
import { EventService } from '../src/events/service.js';
import { createEventSchema } from '../src/events/http.js';
import { CategoryError, CategoryService, type CategoryInput, type CategoryRepository, type EventCategory } from '../src/events/category.js';
import type { EventRepository } from '../src/events/repository.js';
import type { CreateEventInput, CreateVenueInput, Event, Venue } from '../src/events/types.js';
import type { AppConfig } from '../src/config.js';

const secret = 'test-secret-of-at-least-thirty-two-characters';
const organizerId = 'e6ae9c7b-e184-4c52-b8be-a33de85bccd1';
const customerId = 'c6ae9c7b-e184-4c52-b8be-a33de85bccd3';
const venueId = 'a6ae9c7b-e184-4c52-b8be-a33de85bccd4';
const eventId = 'b6ae9c7b-e184-4c52-b8be-a33de85bccd5';

test('event posters accept supported uploaded images and reject active content', () => {
  const input = {
    venueId,
    name: 'Poster event',
    startsAt: '2099-06-01T18:00:00+00:00',
    seatMap: { rows: [{ label: 'A', category: 'General' }], seatsPerRow: 1 },
    categories: [{ name: 'General', basePriceCents: 1000 }],
  };
  assert.equal(createEventSchema.safeParse({ ...input, posterUrl: 'data:image/png;base64,iVBORw0KGgo=' }).success, true);
  assert.equal(createEventSchema.safeParse({ ...input, posterUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }).success, false);
  assert.equal(createEventSchema.safeParse({ ...input, posterUrl: 'javascript:alert(1)' }).success, false);
});

test('organizers manage category images while customers can only browse', async () => {
  class MemoryCategories implements CategoryRepository {
    private items: EventCategory[] = [{ id: 'default', organizerId: null, name: 'Other', imageUrl: '/images/categories/other.webp' }];
    async list() { return this.items; }
    async create(owner: string, input: CategoryInput) {
      if (this.items.some((item) => item.name.toLowerCase() === input.name.toLowerCase())) throw new CategoryError('CATEGORY_TAKEN');
      const category = { id: 'custom', organizerId: owner, ...input };
      this.items.push(category);
      return category;
    }
    async update(owner: string, id: string, input: CategoryInput) {
      const index = this.items.findIndex((item) => item.id === id && item.organizerId === owner);
      if (index < 0) return null;
      return (this.items[index] = { ...this.items[index]!, ...input });
    }
    async delete(owner: string, id: string) {
      const before = this.items.length;
      this.items = this.items.filter((item) => item.id !== id || item.organizerId !== owner);
      return this.items.length < before;
    }
    async selectable(owner: string, name: string) { return this.items.some((item) => item.name.toLowerCase() === name.toLowerCase() && (!item.organizerId || item.organizerId === owner)); }
  }
  const categories = new CategoryService(new MemoryCategories());
  const server = createServer(createApp(config, new AuthService(new MemoryUsers(), secret), undefined, undefined, undefined, undefined, categories));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const organizerHeaders = { authorization: `Bearer ${signToken({ sub: organizerId, role: 'organizer' }, secret)}`, 'content-type': 'application/json' };
  const customerHeaders = { authorization: `Bearer ${signToken({ sub: customerId, role: 'customer' }, secret)}`, 'content-type': 'application/json' };
  try {
    const body = JSON.stringify({ name: 'Robotics', imageUrl: 'https://example.com/robotics.jpg' });
    assert.equal((await fetch(`${base}/event-categories`, { method: 'POST', headers: customerHeaders, body })).status, 403);
    assert.equal((await fetch(`${base}/event-categories`, { method: 'POST', headers: organizerHeaders, body: JSON.stringify({ name: 'Unsafe', imageUrl: 'javascript:alert(1)' }) })).status, 400);
    assert.equal((await fetch(`${base}/event-categories`, { method: 'POST', headers: organizerHeaders, body })).status, 201);
    assert.equal((await fetch(`${base}/event-categories`, { method: 'POST', headers: organizerHeaders, body })).status, 409);
    assert.equal((await fetch(`${base}/event-categories`)).status, 200);
    assert.equal((await fetch(`${base}/event-categories/custom`, { method: 'PATCH', headers: customerHeaders, body })).status, 403);
    assert.equal((await fetch(`${base}/event-categories/custom`, { method: 'PATCH', headers: organizerHeaders, body: JSON.stringify({ name: 'Robotics', imageUrl: 'data:image/png;base64,iVBORw0KGgo=' }) })).status, 200);
    assert.equal((await fetch(`${base}/event-categories/custom`, { method: 'DELETE', headers: organizerHeaders })).status, 204);
    assert.equal((await categories.list()).length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

class MemoryUsers implements UserRepository {
  async create(input: Pick<User, 'email' | 'passwordHash' | 'role'>) {
    return { id: customerId, ...input };
  }
  async findByEmail() { return null; }
}

class MemoryEvents implements EventRepository {
  private readonly venues = new Map<string, Venue>();
  private readonly events = new Map<string, Event>();

  async createVenue(owner: string, input: CreateVenueInput) {
    const venue = { id: venueId, organizerId: owner, ...input };
    this.venues.set(venue.id, venue);
    return venue;
  }
  async listVenues(owner: string) { return [...this.venues.values()].filter((venue) => venue.organizerId === owner); }
  async updateVenue(input: CreateVenueInput & { venueId: string; organizerId: string }) { const venue = this.venues.get(input.venueId); if (!venue || venue.organizerId !== input.organizerId) return null; const updated = { ...venue, name: input.name, city: input.city, address: input.address }; this.venues.set(venue.id, updated); return updated; }
  async deleteVenue(owner: string, id: string) { const venue = this.venues.get(id); if (!venue || venue.organizerId !== owner) return false; this.venues.delete(id); return true; }
  async createEvent(input: CreateEventInput) {
    const venue = this.venues.get(input.venueId);
    if (!venue || venue.organizerId !== input.organizerId) throw new Error('VENUE_NOT_FOUND_OR_NOT_OWNED');
    const event: Event = {
      id: eventId,
      organizerId: input.organizerId,
      venue,
      name: input.name,
      description: input.description,
      posterUrl: input.posterUrl,
      highlights: input.highlights,
      startsAt: input.startsAt,
      pricingStrategy: input.pricingStrategy,
      status: input.status,
      categories: input.categories.map((category, index) => ({ id: `c6ae9c7b-e184-4c52-b8be-a33de85bcc${index + 10}`, ...category })),
      seats: input.rows.flatMap((row, rowIndex) => Array.from({ length: input.seatsPerRow }, (_, index) => ({
        id: `f6ae9c7b-e184-4c52-b8be-a33de85bcc${rowIndex}${index}`,
        rowLabel: row.label,
        seatNumber: index + 1,
        categoryId: input.categories[0]!.name,
        categoryName: row.category,
        basePriceCents: input.categories[0]!.basePriceCents,
        available: true,
        status: 'available',
      }))),
    };
    this.events.set(event.id, event);
    return event;
  }
  async listOrganizerEvents(owner: string) { return [...this.events.values()].filter((event) => event.organizerId === owner); }
  async updateEvent(input: CreateEventInput & { eventId: string }) {
    const event = await this.findOrganizerEvent(input.organizerId, input.eventId);
    if (!event) return null;
    const updated = { ...event, name: input.name, description: input.description, posterUrl: input.posterUrl, highlights: input.highlights, startsAt: input.startsAt, pricingStrategy: input.pricingStrategy, status: input.status, categories: input.categories.map((category, index) => ({ id: `updated-${index}`, ...category })), seats: input.rows.flatMap((row, rowIndex) => Array.from({ length: input.seatsPerRow }, (_, index) => ({ id: `updated-seat-${rowIndex}-${index}`, rowLabel: row.label, seatNumber: index + 1, categoryId: input.categories[0]!.name, categoryName: row.category, basePriceCents: input.categories[0]!.basePriceCents, available: true, status: 'available' as const }))) };
    this.events.set(event.id, updated);
    return updated;
  }
  async findOrganizerEvent(owner: string, id: string) { return this.events.get(id)?.organizerId === owner ? this.events.get(id)! : null; }
  async updateEventStatus(owner: string, id: string, status: 'published' | 'cancelled') {
    const event = await this.findOrganizerEvent(owner, id);
    if (!event) return null;
    const updated = { ...event, status };
    this.events.set(id, updated);
    return updated;
  }
  async listPublishedEvents() {
    const events = [...this.events.values()].filter((event) => event.status === 'published');
    return { events, total: events.length, page: 1, pageSize: 9, totalPages: events.length ? 1 : 0 };
  }
  async findPublishedEvent(id: string) { const event = this.events.get(id); return event?.status === 'published' ? event : null; }
}

const config: AppConfig = { port: 4000, clientOrigin: 'http://localhost:5173', nodeEnv: 'test', databaseUrl: 'postgresql://localhost/ticketflow', authTokenSecret: secret };

test('organizers create venues and events, while customers cannot manage them', async () => {
  const events = new EventService(new MemoryEvents());
  const server = createServer(createApp(config, new AuthService(new MemoryUsers(), secret), events));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const organizerHeaders = { authorization: `Bearer ${signToken({ sub: organizerId, role: 'organizer' }, secret)}`, 'content-type': 'application/json' };
  const customerHeaders = { authorization: `Bearer ${signToken({ sub: customerId, role: 'customer' }, secret)}`, 'content-type': 'application/json' };

  try {
    const venueResponse = await fetch(`${base}/venues`, { method: 'POST', headers: organizerHeaders, body: JSON.stringify({ name: 'Hall A', city: 'Dhaka', address: '1 Main Street' }) });
    assert.equal(venueResponse.status, 201);
    const customerVenueResponse = await fetch(`${base}/venues`, { method: 'POST', headers: customerHeaders, body: JSON.stringify({ name: 'Nope', city: 'Dhaka', address: '1 Main Street' }) });
    assert.equal(customerVenueResponse.status, 403);

    const eventResponse = await fetch(`${base}/events/organizer`, { method: 'POST', headers: organizerHeaders, body: JSON.stringify({
      venueId, name: 'Summer Live', description: 'A live show', startsAt: '2099-06-01T18:00:00+00:00', pricingStrategy: 'base', status: 'published',
      seatMap: { rows: [{ label: 'A', category: 'VIP' }, { label: 'B', category: 'Standard' }], seatsPerRow: 4 },
      categories: [{ name: 'VIP', basePriceCents: 5000 }, { name: 'Standard', basePriceCents: 2500 }],
    }) });
    assert.equal(eventResponse.status, 201);
    const eventPayload = await eventResponse.json() as { event: Event };
    assert.equal(eventPayload.event.seats.length, 8);
    assert.equal((await fetch(`${base}/events/organizer`, { headers: customerHeaders })).status, 403);
    assert.equal((await fetch(`${base}/events/organizer/${eventId}`, { headers: { authorization: organizerHeaders.authorization } })).status, 200);
    const updateResponse = await fetch(`${base}/events/organizer/${eventId}`, { method: 'PATCH', headers: organizerHeaders, body: JSON.stringify({
      venueId, name: 'Summer Live Updated', description: 'Updated show', startsAt: '2099-06-02T18:00:00+00:00', pricingStrategy: 'early_bird', status: 'draft',
      seatMap: { rows: [{ label: 'A', category: 'VIP' }], seatsPerRow: 2 }, categories: [{ name: 'VIP', basePriceCents: 5500 }],
    }) });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json() as { event: Event }).event.name, 'Summer Live Updated');
    const draftBrowseResponse = await fetch(`${base}/events`);
    assert.equal(draftBrowseResponse.status, 200);
    assert.deepEqual((await draftBrowseResponse.json() as { events: Event[] }).events, []);
    assert.equal((await fetch(`${base}/events/${eventId}`)).status, 404);
    const publishResponse = await fetch(`${base}/events/organizer/${eventId}/status`, { method: 'PATCH', headers: organizerHeaders, body: JSON.stringify({ status: 'published' }) });
    assert.equal(publishResponse.status, 200);
    assert.equal((await fetch(`${base}/events`)).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
