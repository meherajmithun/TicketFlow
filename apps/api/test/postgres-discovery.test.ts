import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PgEventRepository } from '../src/events/repository.js';

const postgresTest = process.env.RUN_POSTGRES_TESTS === '1' ? test : test.skip;

postgresTest('public discovery excludes drafts and filters published events by phase, category, and sort', async () => {
  assert.ok(process.env.DATABASE_URL);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const organizerId = randomUUID();
  const venueId = randomUUID();
  const city = `Discovery-${randomUUID()}`;
  const eventIds = Array.from({ length: 5 }, () => randomUUID());
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();
  try {
    await pool.query("INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'test', 'organizer')", [organizerId, `${organizerId}@test.invalid`]);
    await pool.query('INSERT INTO venues (id, organizer_id, name, city, address) VALUES ($1, $2, $3, $4, $5)', [venueId, organizerId, 'Discovery Venue', city, 'Test Address']);
    const fixtures = [
      { name: 'Private Concert', category: 'Concert', status: 'draft', start: 2, end: 5 },
      { name: 'Alpha Concert', category: 'Concert', status: 'published', start: 2, end: 5 },
      { name: 'Beta Sports', category: 'Sports', status: 'published', start: 4, end: 7 },
      { name: 'Current Workshop', category: 'Workshop', status: 'published', start: -1, end: 2 },
      { name: 'Ended Exhibition', category: 'Exhibition', status: 'published', start: -5, end: -2 },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      await pool.query(
        'INSERT INTO events (id, organizer_id, venue_id, name, description, category, starts_at, ends_at, pricing_strategy, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [eventIds[index], organizerId, venueId, fixture.name, '', fixture.category, at(fixture.start), at(fixture.end), 'base', fixture.status],
      );
    }
    const repository = new PgEventRepository(pool);
    const base = { city, page: 1, pageSize: 20 };
    const all = await repository.listPublishedEvents({ ...base, status: 'all', sort: 'name_asc' });
    assert.deepEqual(all.events.map((event) => event.name), ['Alpha Concert', 'Beta Sports', 'Current Workshop', 'Ended Exhibition']);
    assert.equal(all.total, 4);
    const live = await repository.listPublishedEvents({ ...base, status: 'live' });
    assert.deepEqual(live.events.map((event) => event.name), ['Current Workshop']);
    const ended = await repository.listPublishedEvents({ ...base, status: 'ended' });
    assert.deepEqual(ended.events.map((event) => event.name), ['Ended Exhibition']);
    const concerts = await repository.listPublishedEvents({ ...base, status: 'all', category: 'Concert' });
    assert.deepEqual(concerts.events.map((event) => event.name), ['Alpha Concert']);
    assert.equal(await repository.findPublishedEvent(eventIds[0]!), null);
    assert.equal((await repository.findPublishedEvent(eventIds[4]!))?.name, 'Ended Exhibition');
  } finally {
    await pool.query('DELETE FROM events WHERE venue_id = $1', [venueId]).catch(() => undefined);
    await pool.query('DELETE FROM venues WHERE id = $1', [venueId]).catch(() => undefined);
    await pool.query('DELETE FROM users WHERE id = $1', [organizerId]).catch(() => undefined);
    await pool.end();
  }
});
