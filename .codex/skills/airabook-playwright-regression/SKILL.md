---
name: airabook-playwright-regression
description: Use when implementing or fixing user-facing Airabook functionality to decide whether it needs Playwright coverage, add a focused browser regression, and verify it against isolated Firebase emulators. Skip documentation-only and purely cosmetic edits.
---

# Airabook Playwright Regression

For a functional change, recommend a focused Playwright test when the behavior depends on user interaction, routing, auth, asynchronous data, or a Firebase boundary. Prefer extending an existing scenario in `e2e/` when it already covers the workflow. Use unit tests for isolated logic; a successful build or unrelated unit suite does not verify browser behavior.

## Test the User Outcome

- Reproduce the path a user takes, then assert the visible result and relevant URL or saved data. For persistence, reload and assert again.
- Include the state that caused the bug. For example, a chapter navigation regression should start with a selected page and its `chapter`/`page` query parameters, switch chapters, and check the destination chapter's content after Firestore updates.
- Use stable role, label, or `data-testid` locators. Keep test data distinct and the navigation order deterministic. Avoid fixed waits when an observable condition can be awaited.
- Keep setup proportional to the behavior under test. A full sign-up and book-creation journey is useful when those boundaries matter; otherwise use the seeded emulator user and book.
- Add a durable regression to `scripts/run-airabook-qa.mjs` when it belongs in the normal serial QA and PR checks. Do not treat a skipped test as a pass.

## Run Safely

Read `../../../DEVELOPMENT_PROFILES.md` and use `../airabook-run-profiles/SKILL.md` for emulator startup and port checks. Run browser tests against the isolated `local` profile (`demo-project`), not shared `airabook-dev` data. Tests that create accounts or books should guard on `PLAYWRIGHT_USE_EMULATOR=true`.

- With the local stack running: `npm run test:local:qa` for the serial suite, or run a focused `npx playwright test e2e/<file>.spec.mjs --workers=1` with `PLAYWRIGHT_USE_EMULATOR=true` and `PLAYWRIGHT_BASE_URL` set to the actual Vite URL.
- With the stack down: `npm run test:weekly:qa` starts the isolated stack and runs the serial suite.

Report the test name, command, pass/fail/skip count, and any behavior that remains unverified. If the browser or emulators cannot start, state that limitation rather than treating build success as functional verification.
