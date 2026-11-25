# TicketFlow

[![CI](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/meherajmithun/TicketFlow/actions/workflows/ci.yml)

TicketFlow is a demo event booking app for CPS Academy InterviewQuest-3. An **organizer** creates events and seats. A **customer** finds an event, holds a seat, completes a mock payment, and receives a booking.

**Say it simply:** “TicketFlow lets organizers sell seats and customers book them. PostgreSQL makes sure two customers cannot get the same seat.”

## Try the live app

- Website: https://ticket-flow-tau-drab.vercel.app/
- API health check: https://ticketflow-production-086091eb.up.railway.app/health
- Public demo customer: `ticketflow-demo-302e373f@example.com` / `fYVZBJHjw_oZ7_G1`
- Second demo customer for a same-seat test: `ticketflow-demo-race-058bf9d9@example.com` / `CmKP3GIuBAAJVgPO`
- Organizer demo login: verify a working hosted account before the demo. The local `.env` credentials failed on 25 November 2026.

These customer accounts are disposable and public. Do not reuse their passwords. The payment buttons simulate Stripe and PayPal; they do **not** take real money.

## Run it on your computer

You need **Node.js 22+**, **npm 10+**, and **PostgreSQL 16+**.

1. Create an empty PostgreSQL database named `ticketflow`.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL` and an `AUTH_TOKEN_SECRET` of at least 32 characters. To create an organizer when the API starts, also set `ORGANIZER_EMAIL` and `ORGANIZER_PASSWORD` (at least 12 characters). An existing organizer password is not reset automatically.
3. Run these commands in the project root:

```sh
npm ci
npm run db:migrate
npm run dev:api
```

4. In a second terminal, run `npm run dev:web`.
5. Open http://localhost:5173. The API health check is http://localhost:4000/health.

The API also applies missing database migrations when it starts. Re-running `npm run db:migrate` is safe. Never commit `.env` or real passwords.

## How booking works

1. An organizer creates a venue, an event, seat rows, and prices. They can also add a custom event category with an image.
2. A customer browses **published** events. Drafts stay private.
3. Selecting a seat creates a **five-minute hold**. During that time, another customer cannot take it.
4. A successful **mock** payment changes the booking to `confirmed`. Retrying the same payment request does not charge twice.
5. A cancelled booking releases its seats. A confirmed booking gets a full mock refund only when cancelled more than 24 hours before the event.

Customers see booking notifications in the app. The email channel writes to the API console; it does not send email. Category images can be image URLs or JPG, PNG, or WebP uploads under 2 MB. Uploaded images are stored in PostgreSQL, so this is suitable for a small demo catalog.

## Main API routes

| Area | Routes | What they do |
| --- | --- | --- |
| Accounts | `/auth/register`, `/auth/login`, `/auth/me` | Register customers, sign in, and check the current user. Organizer self-registration is disabled. |
| Organizer | `/venues`, `/events/organizer`, `/event-categories` | Manage your own venues, events, and custom category images. Category names are unique. |
| Discovery | `/events`, `/events/:eventId`, `/event-categories` | Browse published events and category images. Search supports name, city, date, filters, sorting, and pages. |
| Booking | `/bookings/holds`, `/bookings`, `/bookings/:bookingId/payment`, `/bookings/:bookingId/pay`, `/bookings/:bookingId/cancel` | Hold seats, see bookings, make a mock payment, or cancel. |
| Notifications | `/notifications` | See in-app booking messages. |

Organizer and customer routes check the user's role and ownership. Login tokens expire after 12 hours. Passwords are stored as salted hashes. Prices are stored as whole **minor units**: 100 units = ৳1; the website displays taka.

## Code and checks

| Location | Purpose |
| --- | --- |
| `apps/web/` | React and Vite website |
| `apps/api/src/` | Express API and booking rules |
| `apps/api/db/` | PostgreSQL migrations |
| `apps/api/test/` | Unit and PostgreSQL tests |
| `.github/workflows/` | CI and production health checks |
| `ARCHITECTURE.md` | How the code is organized and why |
| `AI_USAGE.md` | What Codex helped create and what to review |

Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:coverage` before pushing. GitHub Actions runs them on every push and pull request, including PostgreSQL integration tests and a coverage report.

## Hosting and limits

Vercel hosts the website. Railway hosts the API and PostgreSQL. Merging a pull request into `main` deploys both services automatically. The API applies pending SQL migrations before it accepts requests. A separate workflow checks that the public website and API respond.

For a real paid service, this demo would still need a real payment processor with verified webhooks, real email delivery, shared rate limiting, and separate image storage. Keep the demo online until the interview rounds finish.

## Video checklist

The project brief asks for a video under **10 minutes**, in English, with your **face camera on** and **your own voice**. Show the hosted booking flow, explain the architecture and same-seat protection, run tests, show CI and deployment, and describe one AI mistake you fixed. Upload an unlisted YouTube video or a public Google Drive link. Check the link while signed out before submitting.
