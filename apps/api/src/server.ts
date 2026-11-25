import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { Pool } from 'pg';
import { PgUserRepository } from './db/users.js';
import { migrate } from './db/migrations.js';
import { AuthService } from './auth/service.js';
import { EventService } from './events/service.js';
import { PgEventRepository } from './events/repository.js';
import { CategoryService, PgCategoryRepository } from './events/category.js';
import { BookingService } from './booking/service.js';
import { PgBookingRepository } from './booking/repository.js';
import { MockPayPalProvider, MockStripeProvider } from './payment/providers.js';
import { PaymentService } from './payment/service.js';
import { PgPaymentRepository } from './payment/repository.js';
import { ConsoleEmailChannel } from './notification/channels.js';
import { NotificationService } from './notification/service.js';
import { PgNotificationRepository } from './notification/repository.js';
import { ensureOrganizer } from './auth/organizer.js';

const config = loadConfig();
const pool = new Pool({ connectionString: config.databaseUrl });
await migrate(pool);
await ensureOrganizer(pool, config.organizerEmail, config.organizerPassword);
const auth = new AuthService(new PgUserRepository(pool), config.authTokenSecret);
const events = new EventService(new PgEventRepository(pool));
const eventCategories = new CategoryService(new PgCategoryRepository(pool));
const bookings = new BookingService(new PgBookingRepository(pool));
const payments = new PaymentService(new PgPaymentRepository(pool), [new MockStripeProvider(), new MockPayPalProvider()]);
const notifications = new NotificationService(new PgNotificationRepository(pool), [new ConsoleEmailChannel()]);
const server = createApp(config, auth, events, bookings, payments, notifications, eventCategories).listen(config.port, () => {
  console.info(`TicketFlow API listening on port ${config.port}`);
});
const expiryTimer = setInterval(() => { void bookings.expireHolds().catch((error: unknown) => console.error('Hold expiry cleanup failed', error)); }, 30_000);

async function shutdown() {
  clearInterval(expiryTimer);
  server.close();
  await pool.end();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
