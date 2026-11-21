import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Pool } from 'pg';
import { PgUserRepository } from './db/users.js';
import { AuthService } from './auth/service.js';
import { EventService } from './events/service.js';
import { PgEventRepository } from './events/repository.js';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const auth = new AuthService(new PgUserRepository(pool), config.authTokenSecret);
const events = new EventService(new PgEventRepository(pool));
const server = createApp(config, auth, events).listen(config.port, () => {
  console.info(`TicketFlow API listening on port ${config.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
