# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is an event ticket booking project for CPS Academy InterviewQuest-3. The API and web app cover authentication, organizer event setup, public browsing, seat holds, booking lifecycle, mock payments, cancellation/refunds, and notifications. CI verifies the PostgreSQL concurrency path; production deployment remains before submission.

## Requirements

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 16 or newer

## Run locally

```sh
cp .env.example .env
# Edit DATABASE_URL and AUTH_TOKEN_SECRET in .env, then:
npm ci
npm run db:migrate
npm run dev
```

`npm run dev` starts the API and web app together. To run them separately, use
`npm run dev:api` and `npm run dev:web` in two terminals. The development web
server proxies `/api` to port 4000, so start the API before testing signup.

Create a local `ticketflow` database and set `DATABASE_URL` and a unique `AUTH_TOKEN_SECRET` of at least 32 characters in `.env` before running the migration. Set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` in the server environment to provision the organizer account on startup; the password must be at least 12 characters and is stored as a salted hash. Never commit the real credentials. Existing organizer credentials are not overwritten. Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/health`.

For a hosted web app, set `VITE_API_URL` to the public HTTPS origin of the API
when building the frontend, and set the API's `CLIENT_ORIGIN` to the exact web
app origin. Without a public API URL, a frontend-only deployment cannot handle
signup, login, events, or booking.

The migration runner records applied SQL files in `schema_migrations`, so running `npm run db:migrate` again is safe. Run it after pulling changes to apply the event details and discovery migrations (`002` and `003`).

## Authentication API

| Route | Body or header | Result |
| --- | --- | --- |
| `POST /auth/register` | JSON: `email`, `password` (5–128 characters); optional `role` must be `customer` | `201` with a customer and bearer token. Organizer self-registration is rejected. |
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
| `POST /bookings/holds` | Customer-only five-minute hold for selected seat IDs |
| `GET /bookings` | List the authenticated customer's bookings and holds |
| `POST /bookings/:bookingId/cancel` | Cancel an owned held/confirmed booking and calculate its refund |
| `POST /bookings/:bookingId/payment` | Move an owned held booking to pending payment |
| `GET /bookings/:bookingId/history` | Read the owned booking's status history |
| `POST /bookings/:bookingId/pay` | Charge a pending booking through `stripe` or `paypal` using an idempotency key |
| `GET /notifications` | List the authenticated customer's in-app notifications |
| `POST /notifications/:notificationId/read` | Mark an in-app notification as read |

Tokens expire after 12 hours. Passwords are stored as salted scrypt hashes. Organizer and customer routes use role guards, and organizer event operations enforce ownership. A booking reaches `confirmed` only after a successful mock payment provider call; there is no direct confirmation endpoint.

Organizer event forms accept a public poster image URL or a JPG, PNG, or WebP upload under 2 MB, a description, and one highlight per line. Uploaded images are stored with the event as data URLs in PostgreSQL, so production image hosting is recommended for larger catalogs. Forms also accept an event category and optional end time; omitted end times default to three hours after the start. Public search, details, and seat holds never expose drafts. The customer account drawer shows confirmed tickets and booking history, including cancellation where permitted.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm run test:coverage
```

CI runs these checks on every push and pull request, starts PostgreSQL for migrations and the same-seat concurrency test, and uploads the coverage report.

## Repository layout

```text
apps/api/            Express API, domain rules, tests, SQL schema
apps/web/            React and Vite frontend
.github/workflows/   CI pipeline
ARCHITECTURE.md      Architecture and design decisions
AI_USAGE.md          AI assistance disclosure
PROPOSAL_PLAN.md     Requirement coverage and next build order
```

## Submission details

| Item | Status |
| --- | --- |
| Frontend URL | Pending deployment |
| Backend URL | Pending deployment |
| Organizer demo credentials | Pending seeded demo accounts |
| Customer demo credentials | Pending seeded demo accounts |
| Video walkthrough | Pending completion |

Development happens on feature branches and reaches `main` through pull requests. Commit messages follow Conventional Commits. Do not push directly to `main`.
