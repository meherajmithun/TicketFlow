import { Pool } from 'pg';
import { loadConfig } from '../config.js';
import { migrate } from './migrations.js';

const pool = new Pool({ connectionString: loadConfig().databaseUrl });
try { await migrate(pool); }
finally { await pool.end(); }
