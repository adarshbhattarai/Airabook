# Self Update Workflow

Use this workflow to refresh frontend context after meaningful changes.

## What To Refresh
Run:

```bash
scripts/refresh_frontend_context.sh
```

This updates:
- `generated/frontend-context-report.md`
- `/Users/adeshbhattarai/.codex/memories/airabook-frontend.md`

## When To Run It
Run the refresh after changes to:
- routes or screens
- browser service/API contracts
- runtime config or environment behavior
- Firebase Functions
- Genkit/AI or streaming behavior
- cross-repo frontend/backend integration
- major docs or package structure

## What It Captures
- current branch and HEAD
- current working tree status
- recent commits
- frontend repo identity
- backend repo location
- stable files to read first

## Cross-Repo Rule
If a change depends on `/Users/adeshbhattarai/code/AiraAI/Agent`, update the relevant FE docs so future sessions know where the backend behavior lives.
