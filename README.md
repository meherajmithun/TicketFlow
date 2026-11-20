# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is an event ticket booking project for CPS Academy InterviewQuest-3. The API now has PostgreSQL-backed account registration and login, signed bearer tokens, and reusable role checks. The web app is still a discovery shell. Event management, seat reservation, payments, notifications, and deployment remain to be built.

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
| `POST /auth/register` | JSON: `email`, `password` (12–128 characters), `role` (`organizer` or `customer`) | `201` with a user and bearer token |
| `POST /auth/login` | JSON: `email`, `password` | User and bearer token |
| `GET /auth/me` | `Authorization: Bearer <token>` | Authenticated user ID and role |

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
