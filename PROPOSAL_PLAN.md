# Proposal coverage and next build order

The project PDF requires a live event booking system, not only a UI or schema. It also requires a public GitHub history with one branch per feature, pull requests into a stable `main`, Conventional Commits, CI on pushes and PRs, and automatic deployment after a merge to `main`.

| Requirement | Current state | Next implementation |
| --- | --- | --- |
| Authentication and roles | Complete: API, UI forms, bearer tokens, role guards, and ownership checks | Add seeded demo accounts |
| Event management | Complete: organizer-owned venues, dynamic rows/categories/prices, future date validation, publish/cancel | Add editing workflows if required by the final submission |
| Browse and search | Complete: public cards, details, suggestions, name/city/date filters, pagination | None required for the core row |
| Seat holds and no double booking | Complete: five-minute transactional holds, row locks, automatic cleanup, and CI PostgreSQL race test | Run the CI integration test before submission |
| Booking lifecycle | Complete: held → pending payment → confirmed/expired/cancelled, history, expiry cleanup, and customer controls | None required for the core row |
| Payments | Complete: mock Stripe and PayPal share one interface, idempotency keys, and successful payment confirms booking | Add provider failure simulations if desired |
| Pricing | Complete: base and early-bird strategies are selected per event and applied during holds | None required for the core row |
| Notifications | Complete: confirmation/cancellation fan-out to in-app storage and console email adapter | Add richer email templates if desired |
| Cancellation and refund | Complete: transactional release and full-refund-more-than-24-hours rule | Connect a real refund provider only for production |
| Delivery | CI complete, deployment pending | Host database, API, and web app; add CD on merge to `main` |

Keep each meaningful change on a focused branch with a pull request. Before submission, run the full CI workflow with PostgreSQL enabled, verify RBAC and the customer booking flow manually, then complete deployment, demo accounts, and the video walkthrough.
