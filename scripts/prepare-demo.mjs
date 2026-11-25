/**
 * Create one upcoming, published event for the hosted walkthrough.
 * Uses organizer credentials from the environment or the repository-root .env.
 * Run with DEMO_API_URL set to the intended API. Re-running keeps an existing
 * future demo event instead of creating duplicates.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

const apiUrl = process.env.DEMO_API_URL?.replace(/\/+$/, '');
const email = process.env.ORGANIZER_EMAIL;
const password = process.env.ORGANIZER_PASSWORD;

if (!apiUrl || !email || !password) {
  console.error('Set DEMO_API_URL, ORGANIZER_EMAIL, and ORGANIZER_PASSWORD before running this script.');
  process.exit(1);
}

async function request(path, options = {}, token) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error?.message ?? response.status}`);
  return body;
}

const { token, user } = await request('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
if (user.role !== 'organizer') throw new Error('The configured account is not an organizer.');

const eventName = 'TicketFlow Live Booking Demo';
const { events } = await request('/events/organizer', {}, token);
const existing = events.find((event) => event.name === eventName && event.status === 'published' && new Date(event.endsAt).getTime() > Date.now());
if (existing) {
  console.info(`Upcoming demo event is already available: ${existing.id}`);
  process.exit(0);
}

const { venues } = await request('/venues', {}, token);
let venue = venues.find((item) => item.name === 'TicketFlow Demo Venue');
if (!venue) {
  ({ venue } = await request('/venues', {
    method: 'POST',
    body: JSON.stringify({ name: 'TicketFlow Demo Venue', city: 'Dhaka', address: 'Dhaka, Bangladesh' }),
  }, token));
}

const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
startsAt.setUTCHours(12, 0, 0, 0); // 18:00 in Bangladesh
const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
const { event } = await request('/events/organizer', {
  method: 'POST',
  body: JSON.stringify({
    venueId: venue.id,
    name: eventName,
    description: 'A sample event for demonstrating seat holds, mock checkout, and booking notifications.',
    posterUrl: 'https://ticket-flow-tau-drab.vercel.app/images/categories/competition.webp',
    highlights: 'Choose a seat\nComplete a mock payment\nSee your booking and notification',
    category: 'Competition',
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    pricingStrategy: 'early_bird',
    status: 'published',
    seatMap: {
      rows: [
        { label: 'A', category: 'Premium' },
        { label: 'B', category: 'Premium' },
        { label: 'C', category: 'General' },
        { label: 'D', category: 'General' },
      ],
      seatsPerRow: 8,
    },
    categories: [
      { name: 'Premium', basePriceCents: 300000 },
      { name: 'General', basePriceCents: 150000 },
    ],
  }),
}, token);
console.info(`Created published demo event: ${event.id} (${event.startsAt})`);
