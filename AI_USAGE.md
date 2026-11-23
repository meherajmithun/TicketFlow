# AI usage

OpenAI Codex helped analyze the project PDF and generate the initial repository structure, web shell, API setup, SQL schema, domain rules, tests, CI workflow, and documentation. The project owner requested this work and must review, understand, and be able to explain every line before submission.

AI output is being checked with linting, TypeScript compilation, unit tests, and human review. This file should be updated as the project develops to record substantial AI assistance and specific mistakes found and corrected.

For the authentication foundation, Codex drafted the PostgreSQL user repository, migration runner, password hashing, signed token handling, validation, routes, role guard, and tests. The owner should review the authentication and database choices before submitting and be able to explain the request path from HTTP through the service to PostgreSQL. Early HTTP tests needed permission outside the restricted sandbox to bind a loopback port. PostgreSQL integration tests were later added and run against a local server.

For event management, Codex added organizer-protected venue and event routes, Zod validation for future event date-times and row/category seat maps, a PostgreSQL event repository with transactional event/category/seat creation, public published-event browsing, ownership filtering, and in-memory API tests. The owner should review the transaction and ownership checks before submission. CI now starts PostgreSQL and runs the live integration path.

Codex then added the organizer studio to the web app. It loads the organizer's own venues and events, creates venues, creates draft or published events, builds row-by-seat maps with category prices, and keeps organizer API authorization in place. The owner should review the browser-to-API request payloads before submission.

Codex added published-event suggestions and public event cards to the customer homepage, plus an organizer publish action for existing drafts. Published ended events can now appear in discovery, but drafts cannot.

Codex added public event filtering/pagination, customer seat selection, and five-minute holds. The hold transaction sorts requested seat IDs, locks the matching PostgreSQL rows, rejects active claims, writes the booking and seat prices, and commits the claim together. CI now runs a two-customer same-seat race against PostgreSQL.

Codex connected the event-level base/early-bird strategy to hold pricing and exposed the strategy selector in the organizer studio. The selected effective price is calculated when the hold is created and persisted in `booking_seats`.

Codex added customer cancellation for held or confirmed bookings. Cancellation locks the booking, releases its seat claims, records the status transition, and applies the existing refund rule to confirmed bookings; held bookings have no paid amount and therefore refund zero. A real payment provider is still required before production refunds are issued.

Codex completed the booking lifecycle endpoints and mock customer controls for payment handoff, confirmation, cancellation, and expiry cleanup. Every transition is checked against the domain state-machine table and appended to `booking_status_history`.

Codex added mock Stripe and PayPal providers behind the `PaymentProvider` interface. Payment attempts use the database's unique booking/idempotency-key constraint, and retries return the existing attempt without charging again; a successful attempt transitions the booking to confirmed.

Codex added confirmation and cancellation notifications through a `NotificationChannel` interface, with an in-app PostgreSQL channel and console email adapter. Notification creation is deduplicated by user, booking, and type so payment retries do not send duplicate confirmations. The owner should review the channel registration and notification read flow.

During the mandatory-requirements audit, Codex removed the direct booking-confirmation endpoint. Customers must now use the pending-payment route followed by a successful mock Stripe or PayPal payment; RBAC and organizer ownership checks were re-verified across the route groups.

One setup mistake was found during review: npm workspaces run API commands from `apps/api`, but the first auth implementation used the default dotenv path and therefore missed the repository-root `.env` file. Codex fixed the config to resolve the root file from the module location and verified the API workspace reads it. This is a concrete mistake and correction the owner can discuss in the video walkthrough.

In the final UI pass, Codex used the owner's screenshots and Tickify's public site as visual references for a dark green and lime TicketFlow theme, featured events, poster-led cards, discovery filters, a separate guide page, split sign-in screen, and account drawer. Codex also added event poster/highlight fields, event categories and end times, customer-only registration, environment-provisioned organizer access, and PostgreSQL tests for public draft filtering and concurrent seat holds. The owner should review these design and access decisions, use original event posters, and explain the implemented behavior in their own video.
