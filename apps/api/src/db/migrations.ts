import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const directory = fileURLToPath(new URL('../../db/', import.meta.url));

export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize startup migrations when more than one API replica starts at once.
    await client.query('SELECT pg_advisory_xact_lock(71563005)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const result = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (result.rowCount) continue;
      await client.query(await readFile(new URL(`../../db/${file}`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      console.info(`Applied ${file}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
