# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is an event ticket booking project for CPS Academy InterviewQuest-3. The API and web app cover authentication, organizer event setup, public browsing, seat holds, booking lifecycle, mock payments, cancellation/refunds, and notifications. CI verifies the PostgreSQL concurrency path. The frontend is hosted on Vercel and the API on Railway.

## Requirements

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 16 or newer

## Run locally

```sh
cp .env.example .env
# Edit DATABASE_URL and AUTH_TOKEN_SECRET in .env, then:
npm ci
npm run db:migrate
npm run dev:api
```

In another terminal:

```sh
npm run dev:web
```

Create a local `ticketflow` database and set `DATABASE_URL` and a unique `AUTH_TOKEN_SECRET` of at least 32 characters in `.env` before running the migration. Set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` in the server environment to provision the organizer account on startup; passwords must be at least 12 characters and are stored as salted hashes. Customer registration enforces the same minimum. Never commit real credentials. Existing organizer credentials are not overwritten. Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/health`.

The migration runner records applied SQL files in `schema_migrations`, so running `npm run db:migrate` again is safe. Run it after pulling changes to apply the event details and discovery migrations (`002` and `003`).

## Authentication API

| Route | Body or header | Result |
| --- | --- | --- |
| `POST /auth/register` | JSON: `email`, `password` (12–128 characters); optional `role` must be `customer` | `201` with a customer and bearer token. Organizer self-registration is rejected. |
| `POST /auth/login` | JSON: `email`, `password` | User and bearer token |
| `GET /auth/me` | `Authorization: Bearer <token>` | Authenticated user ID and role |

## Event management API

Organizer routes require an organizer bearer token. An organizer can only list and retrieve their own venues and events. Event creation generates every seat in the requested row-by-seat map and assigns each row to a defined priced category.

| Route | Result |
| --- | --- |
| `POST /venues` | Create an organizer-owned venue |
| `GET /venues` | List the authenticated organizer's venues |
| `PATCH /venues/:venueId` | Edit an organizer-owned venue |
| `DELETE /venues/:venueId` | Delete an unused organizer-owned venue |
| `POST /events/organizer` | Create a draft or published event with venue, start/end times, event category, ticket categories, poster URL, and seat map |
| `GET /events/organizer` | List the authenticated organizer's events |
| `GET /events/organizer/:eventId` | Retrieve an owned event and its seats |
| `PATCH /events/organizer/:eventId/status` | Publish or cancel an owned event |
| `PATCH /events/organizer/:eventId` | Edit an owned event, including its schedule, pricing, categories, and seat map |
| `GET /events` | Browse published events with optional `q`, `city`, `date`, `status` (`all`, `live`, `upcoming`, `ended`), `category`, `sort`, `page`, and `pageSize` filters |
| `GET /events/:eventId` | View one published event and its seats; ended events cannot be booked |
| `GET /event-categories` | List built-in and organizer-created event categories with customer-facing images |
| `POST /event-categories` | Organizer creates a category with a unique name and image URL or supported image upload |
| `PATCH /event-categories/:categoryId` | Owner edits a category; a category used by an event cannot be renamed |
| `DELETE /event-categories/:categoryId` | Owner deletes an unused category |
| `POST /bookings/holds` | Customer-only five-minute hold for selected seat IDs |
| `GET /bookings` | List the authenticated customer's bookings and holds |
| `POST /bookings/:bookingId/cancel` | Cancel an owned held/confirmed booking and calculate its refund |
| `POST /bookings/:bookingId/payment` | Move an owned held booking to pending payment |
| `GET /bookings/:bookingId/history` | Read the owned booking's status history |
| `POST /bookings/:bookingId/pay` | Charge a pending booking through `stripe` or `paypal` using an idempotency key |
| `GET /notifications` | List the authenticated customer's in-app notifications |
| `POST /notifications/:notificationId/read` | Mark an in-app notification as read |

Tokens expire after 12 hours. Passwords are stored as salted scrypt hashes. Organizer and customer routes use role guards, and organizer event operations enforce ownership. Public login and registration are limited to 10 requests per IP per 15 minutes per endpoint (per-process memory; use a shared store for multiple API replicas). A booking reaches `confirmed` only after a successful **mock** payment provider call; there is no direct confirmation endpoint. The Stripe and PayPal adapters are simulations and must not be used to accept real money. The email notification adapter logs to the API console; it does not send email.

Prices are stored as integer minor units in the API and displayed as taka in the web app (100 minor units = ৳1). Organizer price inputs are in taka.

Organizer event forms accept a public poster image URL or a JPG, PNG, or WebP upload under 2 MB, a description, and one highlight per line. Uploaded images are stored with the event as data URLs in PostgreSQL, so production image hosting is recommended for larger catalogs. Forms also accept an event category and optional end time; omitted end times default to three hours after the start. Public search, details, and seat holds never expose drafts. The customer account drawer shows confirmed tickets and booking history, including cancellation where permitted.

Organizers can add event categories in the studio with a name and landscape image (HTTPS URL or JPG, PNG, or WebP upload under 2 MB). Custom names are unique across the catalog; organizers can edit or delete only their own categories. Built-in categories remain available. Customer category tiles use the saved image, and selecting a tile filters events by its category. Uploaded category images are stored as data URLs in PostgreSQL; use hosted image storage for larger production catalogs. Run migration `005_event_categories.sql` before deploying this feature.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm run test:coverage
```

CI runs these checks on every push and pull request, starts PostgreSQL for migrations and the same-seat concurrency test, and uploads the coverage report.

## Production deployment

- Frontend: https://ticket-flow-tau-drab.vercel.app/
- API health: https://ticketflow-production-086091eb.up.railway.app/health
- Vercel builds `apps/web` and needs `VITE_API_URL=https://ticketflow-production-086091eb.up.railway.app` in its Production and Preview environments. Preview deployments must use an API whose `CLIENT_ORIGIN` allows that preview origin.
- Railway runs the API with `DATABASE_URL`, `AUTH_TOKEN_SECRET`, and `CLIENT_ORIGIN=https://ticket-flow-tau-drab.vercel.app`. Set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` together if the organizer account must be provisioned.
- The API applies pending SQL migrations before it starts accepting requests, using its Railway `DATABASE_URL`. The same migration runner remains available as `npm run db:migrate`. Keep database URLs and secrets in Railway, never in Git.
- To create an upcoming event for the walkthrough, set `DEMO_API_URL` to the hosted API URL and run `npm run demo:prepare` with valid organizer credentials in the environment. The script reuses an existing future demo event and never prints credentials.
- Before accepting real customers, configure a real payment processor with signed webhook verification and reconciliation, a transactional email provider, shared rate-limit storage for multiple API replicas, and object storage for uploaded posters. Poster uploads currently become base64 data URLs in PostgreSQL; this is suitable only for the small demo catalog.
- Vercel and Railway are connected to this GitHub repository. Their deployment statuses succeeded for the latest checked `main` merge; merging a pull request into `main` deploys production. The production smoke-check workflow then checks the public frontend and API.

## Repository layout

```text
apps/api/            Express API, domain rules, tests, SQL schema
apps/web/            React and Vite frontend
.github/workflows/   CI pipeline
ARCHITECTURE.md      Architecture and design decisions
AI_USAGE.md          AI assistance disclosure
PROPOSAL_PLAN.md     Requirement coverage and next build order
SUBMISSION_GUIDE.md  Recording outline and final verification steps
```

## Submission details

| Item | Status |
| --- | --- |
| Frontend URL | https://ticket-flow-tau-drab.vercel.app/ |
| Backend URL | https://ticketflow-production-086091eb.up.railway.app/ |
| Organizer demo credentials | Pending hosted organizer access; provide the test login in the submission form |
| Customer demo credentials | `ticketflow-demo-302e373f@example.com` / `fYVZBJHjw_oZ7_G1` (public disposable demo account) |
| Second customer for seat-race demo | `ticketflow-demo-race-058bf9d9@example.com` / `CmKP3GIuBAAJVgPO` (public disposable demo account) |
| Video walkthrough | Pending completion |

The hosted deployment is a demonstration environment: payment and email integrations are mocked. Do not enter real payment details. The customer credential above is intentionally public and should never be reused for another account. Keep real account passwords and deployment secrets out of this repository.

Development happens on feature branches and reaches `main` through pull requests. Commit messages follow Conventional Commits. Do not push directly to `main`.
