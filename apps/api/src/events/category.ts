import type { Pool } from 'pg';

export type EventCategory = { id: string; organizerId: string | null; name: string; imageUrl: string };
export type CategoryInput = { name: string; imageUrl: string };

export class CategoryError extends Error {
  constructor(public readonly code: 'CATEGORY_NOT_FOUND' | 'CATEGORY_IN_USE' | 'CATEGORY_TAKEN' | 'CATEGORY_NOT_AVAILABLE') {
    super({
      CATEGORY_NOT_FOUND: 'Category not found or not owned by this organizer',
      CATEGORY_IN_USE: 'A category used by an event cannot be deleted or renamed',
      CATEGORY_TAKEN: 'A category with this name already exists',
      CATEGORY_NOT_AVAILABLE: 'Choose a built-in category or one you created',
    }[code]);
  }
}

export interface CategoryRepository {
  list(): Promise<EventCategory[]>;
  create(organizerId: string, input: CategoryInput): Promise<EventCategory>;
  update(organizerId: string, id: string, input: CategoryInput): Promise<EventCategory | null>;
  delete(organizerId: string, id: string): Promise<boolean>;
  selectable(organizerId: string, name: string): Promise<boolean>;
}

export class PgCategoryRepository implements CategoryRepository {
  constructor(private readonly pool: Pool) {}

  async list() {
    const result = await this.pool.query<EventCategory>('SELECT id, organizer_id AS "organizerId", name, image_url AS "imageUrl" FROM event_categories ORDER BY CASE WHEN organizer_id IS NULL THEN 0 ELSE 1 END, name');
    return result.rows;
  }

  async create(organizerId: string, input: CategoryInput) {
    try {
      const result = await this.pool.query<EventCategory>('INSERT INTO event_categories (organizer_id, name, image_url) VALUES ($1, $2, $3) RETURNING id, organizer_id AS "organizerId", name, image_url AS "imageUrl"', [organizerId, input.name, input.imageUrl]);
      return result.rows[0]!;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new CategoryError('CATEGORY_TAKEN');
      throw error;
    }
  }

  async update(organizerId: string, id: string, input: CategoryInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ name: string }>('SELECT name FROM event_categories WHERE id = $1 AND organizer_id = $2 FOR UPDATE', [id, organizerId]);
      if (!current.rows[0]) { await client.query('ROLLBACK'); return null; }
      if (current.rows[0].name !== input.name) {
        const used = await client.query('SELECT 1 FROM events WHERE lower(category) = lower($1) LIMIT 1', [current.rows[0].name]);
        if (used.rows.length) throw new CategoryError('CATEGORY_IN_USE');
      }
      const result = await client.query<EventCategory>('UPDATE event_categories SET name = $3, image_url = $4 WHERE id = $1 AND organizer_id = $2 RETURNING id, organizer_id AS "organizerId", name, image_url AS "imageUrl"', [id, organizerId, input.name, input.imageUrl]);
      await client.query('COMMIT');
      return result.rows[0] ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new CategoryError('CATEGORY_TAKEN');
      throw error;
    } finally { client.release(); }
  }

  async delete(organizerId: string, id: string) {
    const result = await this.pool.query(`DELETE FROM event_categories c WHERE c.id = $1 AND c.organizer_id = $2 AND NOT EXISTS (SELECT 1 FROM events e WHERE lower(e.category) = lower(c.name)) RETURNING id`, [id, organizerId]);
    return Boolean(result.rowCount);
  }

  async selectable(organizerId: string, name: string) {
    const result = await this.pool.query('SELECT 1 FROM event_categories WHERE lower(name) = lower($1) AND (organizer_id IS NULL OR organizer_id = $2)', [name, organizerId]);
    return Boolean(result.rowCount);
  }
}

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}
  list() { return this.categories.list(); }
  create(organizerId: string, input: CategoryInput) { return this.categories.create(organizerId, input); }
  async update(organizerId: string, id: string, input: CategoryInput) {
    const category = await this.categories.update(organizerId, id, input);
    if (!category) throw new CategoryError('CATEGORY_NOT_FOUND');
    return category;
  }
  async delete(organizerId: string, id: string) {
    if (!(await this.categories.delete(organizerId, id))) throw new CategoryError('CATEGORY_IN_USE');
  }
  async assertSelectable(organizerId: string, name: string) {
    if (!(await this.categories.selectable(organizerId, name))) throw new CategoryError('CATEGORY_NOT_AVAILABLE');
  }
}
