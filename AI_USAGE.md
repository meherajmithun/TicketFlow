# AI usage

OpenAI Codex helped analyze the project PDF and generate the initial repository structure, web shell, API setup, SQL schema, domain rules, tests, CI workflow, and documentation. The project owner requested this work and must review, understand, and be able to explain every line before submission.

AI output is being checked with linting, TypeScript compilation, unit tests, and human review. This file should be updated as the project develops to record substantial AI assistance and specific mistakes found and corrected.

For the authentication foundation, Codex drafted the PostgreSQL user repository, migration runner, password hashing, signed token handling, validation, routes, role guard, and tests. The owner should review the authentication and database choices before submitting and be able to explain the request path from HTTP through the service to PostgreSQL. The HTTP test could not bind a loopback port in the restricted sandbox, so Codex reran the coverage command with permission outside the sandbox; all eight tests passed. No PostgreSQL integration test was run because a local server is not installed.

One setup mistake was found during review: npm workspaces run API commands from `apps/api`, but the first auth implementation used the default dotenv path and therefore missed the repository-root `.env` file. Codex fixed the config to resolve the root file from the module location and verified the API workspace reads it. This is a concrete mistake and correction the owner can discuss in the video walkthrough.
