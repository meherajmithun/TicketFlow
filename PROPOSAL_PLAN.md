# Proposal coverage and next build order

The project PDF requires a live event booking system, not only a UI or schema. It also requires a public GitHub history with one branch per feature, pull requests into a stable `main`, Conventional Commits, CI on pushes and PRs, and automatic deployment after a merge to `main`.

| Requirement | Current state | Next implementation |
| --- | --- | --- |
| Authentication and roles | Customer self-registration, bearer tokens, role guards, ownership checks, environment-provisioned organizer login, and a working public customer demo account | Restore access to the hosted organizer account and provide its demo login |
| Event management | Organizer-owned venues, dynamic rows/categories/prices, start/end time, event category, private drafts, event editing, poster URL, description/highlights, publish/cancel | Apply all migrations on the hosted database |
| Browse and search | Published-only poster cards/details, suggestions, name/city/date, phase/category filters, sorting, pagination | Verify a draft is absent from public results on the hosted API |
| Seat holds and no double booking | Five-minute transactional holds, row locks, automatic cleanup (including replaced expired claims), and PostgreSQL race test | Confirm the latest CI integration run after merging |
| Booking lifecycle | Complete: held → pending payment → confirmed/expired/cancelled, history, expiry cleanup, and customer controls | None required for the core row |
| Payments | Mock Stripe and PayPal share one interface; retries return the saved attempt; confirmation checks the active seat claim | Confirm the latest CI integration run after merging |
| Pricing | Complete: base and early-bird strategies are selected per event and applied during holds | None required for the core row |
| Notifications | Complete: confirmation/cancellation fan-out to in-app storage and console email adapter | Add richer email templates if desired |
| Cancellation and refund | Complete: transactional release and full-refund-more-than-24-hours rule | Connect a real refund provider only for production |
| Delivery | Frontend, API, and database respond publicly; CI and production smoke checks exist; Vercel and Railway both reported successful deployment for the latest checked `main` merge | Merge the tested branch, create an upcoming hosted demo event, and record the required video |

Keep each meaningful change on a focused branch with a pull request. Before submission, confirm the full CI run with PostgreSQL enabled, the hosted organizer and customer demo logins, the live booking flow, automatic deployment from `main`, and the English face-camera video walkthrough. The project's stated deadline was 23 November 2026, 11:59 PM BDT; check with the project organizers whether a later submission is accepted.
