import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { CategoryError, PgCategoryRepository } from '../src/events/category.js';

test('PostgreSQL stores category images and enforces ownership and unique names', { skip: process.env.RUN_POSTGRES_TESTS !== '1' }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const owner = randomUUID();
  const other = randomUUID();
  const name = `Robotics ${randomUUID()}`;
  const imageUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const categories = new PgCategoryRepository(pool);
  try {
    await pool.query(`INSERT INTO users (id, email, password_hash, role) VALUES ($1, $2, 'test-only', 'organizer'), ($3, $4, 'test-only', 'organizer')`, [owner, `${owner}@example.test`, other, `${other}@example.test`]);
    const created = await categories.create(owner, { name, imageUrl });
    assert.equal(created.imageUrl, imageUrl);
    assert.equal(created.organizerId, owner);
    assert.equal(await categories.selectable(owner, name), true);
    assert.equal(await categories.selectable(other, name), false);
    assert.equal((await categories.list()).find((item) => item.id === created.id)?.imageUrl, imageUrl);
    await assert.rejects(() => categories.create(other, { name: name.toLowerCase(), imageUrl }), (error: unknown) => error instanceof CategoryError && error.code === 'CATEGORY_TAKEN');
    assert.equal(await categories.update(other, created.id, { name, imageUrl: 'https://example.com/new.jpg' }), null);
    assert.equal(await categories.delete(other, created.id), false);
    const updated = await categories.update(owner, created.id, { name, imageUrl: 'https://example.com/new.jpg' });
    assert.equal(updated?.imageUrl, 'https://example.com/new.jpg');
    assert.equal(await categories.delete(owner, created.id), true);
  } finally {
    await pool.query('DELETE FROM event_categories WHERE organizer_id IN ($1, $2)', [owner, other]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [owner, other]);
    await pool.end();
  }
});
