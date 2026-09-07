# Weekly Airabook QA automation

Use this as the prompt for a weekly Codex Automation scheduled in the Codex
app. The repository runner is the source of truth; the automation should not
invent a different test command.

```text
In /Users/adarshbhattarai/code/Airabook/Airabook, run:

  npm run test:weekly:qa

This is an isolated local-emulator QA run. Do not run npm run dev, do not use
airabook-dev data, and do not deploy. Report the final Playwright pass/fail
summary and the first failing test with its trace or error. If it fails because
of a product regression, inspect and report the likely code path; do not change
application code automatically. If it fails because a local dependency or
emulator could not start, report that as infrastructure failure.
```

Recommended schedule: once weekly, during a time when the machine is awake.
The runner starts and cleans up its own local profile when no compatible local
stack is already running. It recreates only the fixed emulator account and
seeded emulator book.
