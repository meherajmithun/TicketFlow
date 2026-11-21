import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Pool } from 'pg';
import { PgUserRepository } from './db/users.js';
import { AuthService } from './auth/service.js';
import { EventService } from './events/service.js';
import { PgEventRepository } from './events/repository.js';
import { BookingService } from './booking/service.js';
import { PgBookingRepository } from './booking/repository.js';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
const auth = new AuthService(new PgUserRepository(pool), config.authTokenSecret);
const events = new EventService(new PgEventRepository(pool));
const bookings = new BookingService(new PgBookingRepository(pool));
const server = createApp(config, auth, events, bookings).listen(config.port, () => {
  console.info(`TicketFlow API listening on port ${config.port}`);
});
const expiryTimer = setInterval(() => { void bookings.expireHolds(); }, 30_000);

async function shutdown() {
  clearInterval(expiryTimer);
  server.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
