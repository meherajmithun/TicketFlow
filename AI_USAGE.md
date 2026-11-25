# How AI was used

**Short explanation:** “OpenAI Codex helped build TicketFlow. Automated checks tested its output, and I must review and understand every part before submitting it.”

The project owner gave the requirements, feedback, screenshots, and feature requests. **OpenAI Codex** helped plan and write code, tests, and documentation. AI assistance does not replace the owner's responsibility to review the work and explain or change it during the interview.

## What Codex helped build

| Area | Work done with Codex |
| --- | --- |
| Accounts and events | Customer registration and login, organizer role checks, venues, events, seat maps, and PostgreSQL queries. |
| Booking rules | Five-minute holds, booking status history, same-seat protection, pricing choices, cancellation, and refund rules. |
| Payments and notices | Two **mock** payment providers, retry protection using an idempotency key, in-app notices, and console email. |
| Website | Event browsing, filters, seat selection, mock checkout, organizer studio, and category images. |
| Delivery and checks | Database migrations, unit and PostgreSQL tests, GitHub Actions, deployment checks, and documentation. |

Codex also used the owner's screenshots and the public Tickify site as visual references. Event images and branding should be checked for permission and originality before wider use.

## One AI mistake that was fixed

The first account setup looked for `.env` inside `apps/api`. But npm runs API commands from that folder while the real `.env` file is in the repository root. This caused the API to miss its settings. The config was changed to load the root file, and the API was checked again.

**How to explain it:** “I found that the API could not read the root `.env` file. I traced it to the npm workspace path, fixed the path, and verified that the API loaded the settings.”

## What was checked

- Lint, TypeScript type checking, and production builds were run.
- Unit tests check booking status, hold expiry, pricing, and refunds.
- PostgreSQL tests check the same-seat race, payment retries, event discovery, and category ownership.
- GitHub Actions runs these checks on pushes and pull requests and saves a coverage report.

The owner should still read the code personally, test the live organizer and customer flows, and record the required video with their own face and voice. The current Stripe, PayPal, and email integrations are demonstrations; they do not charge money or send email.
