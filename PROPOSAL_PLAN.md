# Proposal coverage and next build order

The project PDF requires a live event booking system, not only a UI or schema. It also requires a public GitHub history with one branch per feature, pull requests into a stable `main`, Conventional Commits, CI on pushes and PRs, and automatic deployment after a merge to `main`.

| Requirement | Current state | Next implementation |
| --- | --- | --- |
| Authentication and roles | Customer self-registration, bearer tokens, role guards, ownership checks, and environment-provisioned organizer login | Configure organizer credentials on the host and provide a customer demo account |
| Event management | Organizer-owned venues, dynamic rows/categories/prices, start/end time, event category, private drafts, event editing, poster URL, description/highlights, publish/cancel | Apply all migrations on the hosted database |
| Browse and search | Published-only poster cards/details, suggestions, name/city/date, phase/category filters, sorting, pagination | Verify a draft is absent from public results on the hosted API |
| Seat holds and no double booking | Complete: five-minute transactional holds, row locks, automatic cleanup, and CI PostgreSQL race test | Run the CI integration test before submission |
| Booking lifecycle | Complete: held → pending payment → confirmed/expired/cancelled, history, expiry cleanup, and customer controls | None required for the core row |
| Payments | Complete: mock Stripe and PayPal share one interface, idempotency keys, and successful payment confirms booking | Add provider failure simulations if desired |
| Pricing | Complete: base and early-bird strategies are selected per event and applied during holds | None required for the core row |
| Notifications | Complete: confirmation/cancellation fan-out to in-app storage and console email adapter | Add richer email templates if desired |
| Cancellation and refund | Complete: transactional release and full-refund-more-than-24-hours rule | Connect a real refund provider only for production |
| Delivery | CI complete, deployment and CD pending | Host database, API, and web app; configure automatic frontend and backend deployment on merge to `main` |

Keep each meaningful change on a focused branch with a pull request. Before submission, run the full CI workflow with PostgreSQL enabled, verify RBAC and the customer booking flow on the hosted app, then complete deployment, demo accounts, and the English video walkthrough.
