# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is an event ticket booking project for CPS Academy InterviewQuest-3. The API has PostgreSQL-backed account registration and login, signed bearer tokens, reusable role checks, and organizer-owned venue/event management. The web app includes the account experience, discovery shell, and organizer studio; seat reservation, payments, notifications, and deployment remain to be built.

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

Create a local `ticketflow` database and set `DATABASE_URL` and a unique `AUTH_TOKEN_SECRET` of at least 32 characters in `.env` before running the migration. Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/health`.

The migration runner records applied SQL files in `schema_migrations`, so running `npm run db:migrate` again is safe. The initial schema is in `apps/api/db/001_initial.sql`.

## Authentication API

| Route | Body or header | Result |
| --- | --- | --- |
| `POST /auth/register` | JSON: `email`, `password` (5–128 characters), `role` (`organizer` or `customer`) | `201` with a user and bearer token |
| `POST /auth/login` | JSON: `email`, `password` | User and bearer token |
| `GET /auth/me` | `Authorization: Bearer <token>` | Authenticated user ID and role |

## Event management API

Organizer routes require an organizer bearer token. An organizer can only list and retrieve their own venues and events. Event creation generates every seat in the requested row-by-seat map and assigns each row to a defined priced category.

| Route | Result |
| --- | --- |
| `POST /venues` | Create an organizer-owned venue |
| `GET /venues` | List the authenticated organizer's venues |
| `POST /events/organizer` | Create a draft or published event with venue, date-time, categories, and seat map |
| `GET /events/organizer` | List the authenticated organizer's events |
| `GET /events/organizer/:eventId` | Retrieve an owned event and its seats |
| `PATCH /events/organizer/:eventId/status` | Publish or cancel an owned event |
| `GET /events` | Browse future published events with optional `q`, `city`, `date`, `page`, and `pageSize` filters |
| `GET /events/:eventId` | View one future published event and its seats |
| `POST /bookings/holds` | Customer-only five-minute hold for selected seat IDs |
| `GET /bookings` | List the authenticated customer's bookings and holds |
| `POST /bookings/:bookingId/cancel` | Cancel an owned held/confirmed booking and calculate its refund |
| `POST /bookings/:bookingId/payment` | Move an owned held booking to pending payment |
| `POST /bookings/:bookingId/confirm` | Confirm an owned pending-payment booking through the mock payment step |
| `GET /bookings/:bookingId/history` | Read the owned booking's status history |
| `POST /bookings/:bookingId/pay` | Charge a pending booking through `stripe` or `paypal` using an idempotency key |

Tokens expire after 12 hours. Passwords are stored as salted scrypt hashes. The role guard is ready for organizer and customer routes, but no event or booking routes exist yet.

## Checks

```sh
npm run lint
npm run typecheck
npm run build
npm run test:coverage
```

CI runs these checks on every push and pull request and uploads the coverage report.

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
