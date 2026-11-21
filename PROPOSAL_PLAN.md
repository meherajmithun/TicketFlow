# Proposal coverage and next build order

The project PDF requires a live event booking system, not only a UI or schema. It also requires a public GitHub history with one branch per feature, pull requests into a stable `main`, Conventional Commits, CI on pushes and PRs, and automatic deployment after a merge to `main`.

| Requirement | Current state | Next implementation |
| --- | --- | --- |
| Authentication and roles | API registration, login, bearer authentication, role guard | Add UI forms and demo accounts |
| Event management | Organizer-owned venue/event APIs plus organizer dashboard for venue, date-time, seat-map, category, and price setup | Add event editing/cancellation workflows |
| Browse and search | Database-backed public event cards, suggestions, and name/city/date filters with pagination | Add richer filter controls and event detail navigation |
| Seat holds and no double booking | Customer seat picker and five-minute transactional holds with PostgreSQL row locks | Add explicit expiry cleanup job and two-user PostgreSQL race test |
| Booking lifecycle | Held → pending payment → confirmed/expired/cancelled transitions, history, expiry cleanup, and customer controls | Connect real payment attempts and notifications |
| Payments | Mock Stripe and PayPal providers share one interface; payment attempts are idempotent and successful payment confirms the booking | Add provider failure simulations and production adapter |
| Pricing | Organizer selects base or early-bird per event; selected strategy is applied during a hold and persisted per seat | Add pricing display refinement during checkout |
| Notifications | SQL table only | In-app notifications and console email adapters |
| Cancellation and refund | Customer cancellation releases claims transactionally and applies the full-refund-more-than-24-hours rule | Connect a real payment/refund provider after payment confirmation |
| Delivery | CI exists | Host database, API, and web app; add CD on merge to `main` |

Build each row on a focused branch with a pull request. The next feature after this auth foundation should be event management and browsing because seat booking needs published events and generated seats. Then implement transactional holds before payment or UI checkout. Verify the two-user same-seat race against PostgreSQL before submission. Keep bonus features until all mandatory rows are complete.
