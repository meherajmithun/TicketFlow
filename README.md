# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is an event ticket booking project for CPS Academy InterviewQuest-3. This repository currently contains the **initial structure**: a web shell, an API health endpoint, core booking rules with unit tests, and a PostgreSQL schema. Authentication, event management, seat reservation, payments, notifications, and deployment are still to be implemented.

## Requirements

- Node.js 22 or newer and npm 10 or newer
- PostgreSQL 16 or newer for the database-backed features being built next

## Run locally

```sh
cp .env.example .env
npm ci
npm run dev:api
```

In another terminal:

```sh
npm run dev:web
```

Open `http://localhost:5173`. The API health endpoint is `http://localhost:4000/health`.

The SQL schema is in `apps/api/db/001_initial.sql`. After creating a local `ticketflow` database, apply it with `psql "$DATABASE_URL" -f apps/api/db/001_initial.sql`. The current API does not connect to the database yet.

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
```

## Submission details

| Item | Status |
| --- | --- |
| Frontend URL | Pending deployment |
| Backend URL | Pending deployment |
| Organizer demo credentials | Pending authentication implementation |
| Customer demo credentials | Pending authentication implementation |
| Video walkthrough | Pending completion |

Development happens on branches and reaches `main` through pull requests. Commit messages use Conventional Commits without the `feat` type, as requested for this initial work.
