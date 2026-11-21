# AI usage

OpenAI Codex helped analyze the project PDF and generate the initial repository structure, web shell, API setup, SQL schema, domain rules, tests, CI workflow, and documentation. The project owner requested this work and must review, understand, and be able to explain every line before submission.

AI output is being checked with linting, TypeScript compilation, unit tests, and human review. This file should be updated as the project develops to record substantial AI assistance and specific mistakes found and corrected.

For the authentication foundation, Codex drafted the PostgreSQL user repository, migration runner, password hashing, signed token handling, validation, routes, role guard, and tests. The owner should review the authentication and database choices before submitting and be able to explain the request path from HTTP through the service to PostgreSQL. The HTTP test could not bind a loopback port in the restricted sandbox, so Codex reran the coverage command with permission outside the sandbox; all eight tests passed. No PostgreSQL integration test was run because a local server is not installed.

For event management, Codex added organizer-protected venue and event routes, Zod validation for future event date-times and row/category seat maps, a PostgreSQL event repository with transactional event/category/seat creation, public published-event browsing, ownership filtering, and in-memory API tests. The owner should review the transaction and ownership checks before submission. PostgreSQL integration tests still need to be run against the local database.

Codex then added the organizer studio to the web app. It loads the organizer's own venues and events, creates venues, creates draft or published events, builds row-by-seat maps with category prices, and keeps organizer API authorization in place. The owner should review the browser-to-API request payloads before submission.

Codex added published-event suggestions and public event cards to the customer homepage, plus an organizer publish action for existing drafts. The owner should verify that only future published events appear to customers.

Codex added public event filtering/pagination, customer seat selection, and five-minute holds. The hold transaction sorts requested seat IDs, locks the matching PostgreSQL rows, rejects active claims, writes the booking and seat prices, and commits the claim together. The owner should review the transaction and test the same-seat race against PostgreSQL before submission; the current automated suite does not run a live PostgreSQL integration test.

One setup mistake was found during review: npm workspaces run API commands from `apps/api`, but the first auth implementation used the default dotenv path and therefore missed the repository-root `.env` file. Codex fixed the config to resolve the root file from the module location and verified the API workspace reads it. This is a concrete mistake and correction the owner can discuss in the video walkthrough.
