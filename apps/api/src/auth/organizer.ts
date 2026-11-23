import type { Pool } from 'pg';
import { hashPassword } from './password.js';

/** Create the preconfigured organizer without replacing an existing account or password. */
export async function ensureOrganizer(pool: Pool, email?: string, password?: string) {
  if (!email || !password) return;
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await pool.query<{ role: string }>('SELECT role FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows[0]) {
    if (existing.rows[0].role !== 'organizer') throw new Error('Configured organizer email belongs to a customer');
    return;
  }
  const passwordHash = await hashPassword(password);
  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'organizer') ON CONFLICT (email) DO NOTHING`,
    [normalizedEmail, passwordHash],
  );
}
