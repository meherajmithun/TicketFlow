# Proposal coverage and next build order

The project PDF requires a live event booking system, not only a UI or schema. It also requires a public GitHub history with one branch per feature, pull requests into a stable `main`, Conventional Commits, CI on pushes and PRs, and automatic deployment after a merge to `main`.

| Requirement | Current state | Next implementation |
| --- | --- | --- |
| Authentication and roles | API registration, login, bearer authentication, role guard | Add UI forms and demo accounts |
| Event management | Organizer-owned venue/event APIs plus organizer dashboard for venue, date-time, seat-map, category, and price setup | Add event editing/cancellation workflows |
| Browse and search | Static page | Database-backed search by name, city, and date with filters and pagination |
| Seat holds and no double booking | Domain expiry rule and SQL model | Transactional seat claims with conditional updates, expiry cleanup, and concurrency tests |
| Booking lifecycle | Pure transition rule and status-history table | Booking service, status history, and ownership checks |
| Payments | Idempotency constraint in SQL | Two mock providers behind one interface and retry-safe payment attempts |
| Pricing | Base and early-bird strategies | Apply selected strategy during a hold and persist seat prices |
| Notifications | SQL table only | In-app notifications and console email adapters |
| Cancellation and refund | Pure refund rule | Transactional cancellation, claim release, and refund workflow |
| Delivery | CI exists | Host database, API, and web app; add CD on merge to `main` |

Build each row on a focused branch with a pull request. The next feature after this auth foundation should be event management and browsing because seat booking needs published events and generated seats. Then implement transactional holds before payment or UI checkout. Verify the two-user same-seat race against PostgreSQL before submission. Keep bonus features until all mandatory rows are complete.
