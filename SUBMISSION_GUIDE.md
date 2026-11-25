# TicketFlow submission walkthrough

The proposal requires a video of at most 10 minutes in English, with the owner's face camera on and the owner's own voice. Upload it as an unlisted YouTube video or a public Google Drive link. The owner must understand and explain the code; this outline is a recording aid, not a substitute for that explanation.

## Before recording

1. Confirm `main` contains the tested changes and its latest CI run passed with PostgreSQL enabled.
2. Confirm Vercel and Railway each deploy automatically from `main` after a merge. The repository's CD workflow checks the services but does not perform those deployments itself.
3. Confirm the hosted organizer login. Set `DEMO_API_URL` to the hosted API URL and run `npm run demo:prepare` with the valid organizer credentials in the environment. The script creates one published event seven days ahead with 32 seats, or reuses an existing future demo event.
4. Confirm the public customer demo login in `README.md`. Have a second customer account ready for the same-seat race demonstration.
5. Open the hosted frontend, API health URL, GitHub Actions page, and `ARCHITECTURE.md` before recording. Keep passwords and token values out of the video.

## Suggested recording sequence

| Time | Show and explain |
| --- | --- |
| 0:00–1:00 | Introduce TicketFlow, React/Vite, Express, PostgreSQL, Vercel, and Railway. |
| 1:00–2:30 | Show the architecture diagram and trace browser → HTTP route → service → repository → database. Explain why the state machine, pricing strategy, repository, provider, and channel interfaces are used. |
| 2:30–4:30 | Log in as organizer and create or show a published event. Log in as customer, browse, choose a seat, hold it, use a mock provider, and show the confirmed booking and notification. Use two customers to try the same seat, then show a hold expiring and becoming available. |
| 4:30–7:30 | Trace `POST /bookings/holds` through validation, role guard, booking service, row locks, price calculation, booking rows, and status history. Explain the SOLID examples in `ARCHITECTURE.md` and why one competing seat claim fails. |
| 7:30–8:30 | Show unit and PostgreSQL integration tests, coverage report, the latest CI run, and evidence of automatic Vercel/Railway deployment from `main`. |
| 8:30–10:00 | Explain how AI helped, what you reviewed, and one concrete AI mistake you corrected (the original `.env` path mistake is documented in `AI_USAGE.md`). State what you would improve with more time. |

## Submission fields

Use the public GitHub repository URL, the frontend and API URLs in `README.md`, working demo credentials for both roles, the video link, the tech stack and hosting, and the AI tools used. Check every URL in a private browser window before submitting. The proposal states a deadline of 23 November 2026 at 11:59 PM BDT; ask the organizers whether a later submission is accepted.
