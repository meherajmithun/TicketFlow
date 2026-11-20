import type { Pool } from 'pg';
import type { User, UserRepository, Role } from '../auth/service.js';

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: { email: string; passwordHash: string; role: Role }): Promise<User | null> {
    const result = await this.pool.query<User>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING
       RETURNING id, email, role, password_hash AS "passwordHash"`,
      [input.email, input.passwordHash, input.role],
    );
    return result.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query<User>(
      'SELECT id, email, role, password_hash AS "passwordHash" FROM users WHERE email = $1',
      [email],
    );
    return result.rows[0] ?? null;
  }
}
