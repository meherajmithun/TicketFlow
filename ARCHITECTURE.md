# Architecture

## Current structure

```mermaid
flowchart LR
  Browser[React web app] --> API[Express API]
  API --> Config[Environment config]
  API --> AuthHTTP[Auth routes and role guard]
  AuthHTTP --> AuthService[Auth service]
  AuthService --> UserRepo[User repository interface]
  UserRepo --> PgUsers[PostgreSQL user repository]
  PgUsers --> DB[(PostgreSQL)]
  API -. future booking routes .-> BookingService[Booking service]
  BookingService -. future .-> Domain[Booking, hold, pricing, refund rules]
```

The API exposes `/health` and account registration, login, and profile routes. `server.ts` wires the PostgreSQL pool, user repository, and auth service. `db:migrate` applies SQL files once and records them in `schema_migrations`. The browser still displays the event discovery shell. The booking domain rules remain pure functions awaiting application services.

## Layers to complete

1. **HTTP**: auth routes, Zod input validation, bearer authentication, role checks, and consistent errors are present. Event and booking routes remain.
2. **Application**: auth service is present. Booking workflows and organizer ownership checks remain; transactions belong here.
3. **Domain**: booking status transitions, hold expiry, pricing, and refund policy.
4. **Persistence**: user repository and migration runner are present. Event and booking repositories remain.
5. **Integrations**: mock payment providers and notification channels.

## Design choices already in code

- **State machine**: `booking.ts` defines permitted transitions in one table. It prevents an invalid lifecycle change before persistence updates the booking and status history.
- **Strategy**: `pricing.ts` maps an event's `base` or `early_bird` choice to a pricing function. A caller selects a strategy without embedding pricing branches in booking code.
- **Dependency boundary**: the Express app is created from explicit configuration, so tests and deployment can provide different settings without changing domain code.
- **Repository interface**: `AuthService` depends on `UserRepository`; PostgreSQL is an adapter. Tests use an in-memory implementation.
- **Authentication boundary**: the role guard verifies an HMAC-signed, 12-hour bearer token. Passwords use salted scrypt hashes. Event routes must combine role checks with organizer ownership checks against the database.

Payment providers and notification channels will use interfaces when those features are implemented. They are not represented as completed patterns yet.

## Seat concurrency plan

`event_seats.current_booking_id` represents the current claim. To hold a seat, create a booking and conditionally update the requested seat rows in **one PostgreSQL transaction**, in a stable seat ID order. The update must match only unclaimed seats or expired holds. Check that every requested row was updated before committing; otherwise roll back the whole transaction. PostgreSQL row locking serializes competing updates to the same seat. A payment confirmation must verify that the same booking still owns an unexpired claim before setting `confirmed_at` and the booking status. Expired holds are released by a scheduled cleanup job and may also be replaced atomically by a new hold. This protocol is a design plan and is not implemented yet.

The booking service will validate organizer ownership for event changes, persist every status change in `booking_status_history`, and use `payment_attempts`' unique `(booking_id, idempotency_key)` constraint to make retries safe.
