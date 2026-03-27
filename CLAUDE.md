# Airabook Frontend — CLAUDE.md

## Project Identity
React 18 + Vite frontend for Airabook. Owns browser UI, Firebase Hosting config, Firestore/Storage rules, and Firebase Cloud Functions. The Spring Boot + Spring AI Alibaba backend lives in the sibling repo `Agent/Agent/`.

When a feature crosses both repos, inspect both before changing behavior.

## Product Vision — What We're Building
**Voice-first, AI-controlled book creation:**
1. **Voice control** — mic button triggers WebSocket to Spring backend (`/ws/voice`); user speaks commands to navigate, create, and edit book content
2. **Voice-to-Manim** — user describes a visualization; AI generates Manim code, renders it server-side, embeds video in the book page
3. UI role: capture audio (PCM), stream to backend, receive TTS audio back + structured page/event updates, render HITL approval prompts for destructive actions

**Active branch: `dev-video-flow`** (checkout before touching any video/movies work)
Video/movies files: `src/pages/Movies.jsx`, `src/services/videoJobsService.js`, changes in `src/App.jsx`, `src/components/PageEditor/index.jsx`, `src/config/serviceEndpoints.js`, `src/components/navigation/Sidebar.jsx`

**Future idea (not yet started):** Backend-driven UI execution by voice — user speaks and the backend literally drives the frontend UI actions (browser automation / event replay from voice commands). Needs design/verification pass before implementation.

## Commands

```bash
# Local dev (emulators + frontend)
npm run emulators:local        # Terminal 1: Firebase emulators + Stripe listener
npm run local                  # Terminal 2: Vite on http://localhost:5173

# Real dev environment (no emulators)
npm run dev

# Build for environments
npm run build:dev | build:qa | build:go | build:prod

# Deploy
npm run deploy:dev | deploy:qa | deploy:go | deploy:prod

# Auth sanity check
npm run test:auth

# Stripe webhook local setup
npm run stripe:setup

# Seed emulator data
npm run seed:data
```

## Architecture

```
src/
  App.jsx                    # Route tree + auth shell
  main.jsx                   # React entrypoint
  config/
    runtimeConfig.js         # Env-driven runtime config
    serviceEndpoints.js      # Spring endpoint mapping
  services/
    ApiService.js            # Authenticated browser → backend calls
  components/                # Shared UI widgets, chat, planner, editor, nav
  pages/                     # Route screens (books, dashboard, media, notes, admin)
  context/                   # Auth + theme providers
  lib/                       # Firebase init, streaming helpers, validation

functions/
  index.js                   # All exported Firebase functions
  airabookaiStream.js        # AI streaming function path
  agents/agentServices.js    # Server-side agent helper layer
  flows/                     # Genkit flow definitions
  payments/                  # Stripe billing, credit wallet, webhooks
  services/                  # Server-side domain helpers
  tools/                     # Function-side tool modules

plugins/
  visual-editor/             # Vite plugins for inline visual editing
  vite-plugin-iframe-route-restoration.js
```

## Cross-Repo Boundary
- **This repo**: React UI, Firebase client SDK, Firebase Functions, Genkit flows, Stripe
- **Agent/Agent**: Spring Boot REST/WebSocket, Spring AI planner/chat/voice, Java tools

Frontend Spring integration points: `src/config/serviceEndpoints.js` + `src/services/ApiService.js`

## Firebase Security Rules
- `books` root doc creation is **server-authoritative** (via Admin SDK in functions). Only `isPublic` toggle is client-writable by owner.
- `albums` docs are server-authoritative for create/update/delete; client reads follow access rules.
- `storage.rules` gates raw file writes separately from Firestore. Always trace both when touching uploads.

## Secrets Needed to Run Locally (Linux)

**Frontend Vite env** — create `.env.local` (gitignored):
```bash
# Firebase project config (get from Firebase console → Project settings)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=airabook-dev
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# Spring backend URL (local dev)
VITE_SPRING_API_URL=http://localhost:8080

# Stripe publishable key (for payment UI)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Firebase Functions env** — create `functions/.env` (gitignored):
```bash
# For non-emulator dev only — emulator mode needs none of these
GOOGLE_APPLICATION_CREDENTIALS=/home/adarshbhattarai/.firebase-keys/airabook-dev-key.json
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
OPENAI_API_KEY=sk-...
```

**Emulator-only dev** — no secrets needed. `npm run emulators:local && npm run local` works offline.
Stripe CLI required for `emulators:local`: `stripe listen --forward-to localhost:5001/...`

## Key Environment Files
- `.env.local` / `.env.development` / `.env.production` — Vite env files (never commit)
- `functions/.env` — Firebase Functions env (never commit)
- Firebase projects: `local`, `dev`, `dev2`, `qa`, `go`, `prod`

## Testing

**Always write tests alongside new features. Never mark a feature complete without tests.**

E2E tests use Playwright. All test files live in `e2e/` with `.spec.mjs` extension.

```bash
# Run all e2e tests (needs PLAYWRIGHT_EMAIL + PLAYWRIGHT_PASSWORD)
PLAYWRIGHT_EMAIL=claude@airabook.dev PLAYWRIGHT_PASSWORD=ClaudeAirabook2024 npx playwright test

# Run a single test file
npx playwright test e2e/manim-video-dialog.spec.mjs

# Run with UI
npx playwright test --ui
```

**Test conventions:**
- Use `data-testid` attributes on all interactive elements (dialogs, buttons, inputs)
- Use `test.skip(!email || !password, ...)` guard for any test requiring auth
- Use `test.skip(!(await element.count()), ...)` for smoke tests that need data
- All dialog components must have `data-testid` on: dialog root, key inputs, confirm/cancel buttons

**Existing test files:**
- `e2e/movies.spec.mjs` — Movies workspace smoke tests
- `e2e/manim-video-dialog.spec.mjs` — Manim video prompt dialog
- `e2e/clip-generation.spec.mjs` — Full stack Manim render pipeline (requires Spring + Manim Docker running)

**E2E gotchas:**
- Auth emulator user is **volatile** — recreate after every emulator restart: `node functions/create_emulator_user.mjs` (UID: `DBSLzo0d4xSO6BC1aVC7X9bywEbr`, email: `claude@airabook.dev`, password: `ClaudeAirabook2024`)
- Avoid `!` in `PLAYWRIGHT_PASSWORD` — bash backslash-escapes it even in single quotes, causing `auth/wrong-password`
- Run tests from `Airabook/Airabook/` directory

## Code Conventions
- Use `@/` path alias instead of deep relative imports
- Keep privileged logic and secrets in `functions/`, never in `src/`
- After meaningful changes, run `scripts/refresh_frontend_context.sh`

## Important Non-Obvious Things
- `npm run local` = `npm run start` = Vite in `localemulator` mode (points to Firebase emulators at localhost:4000)
- `npm run emulators:local` wraps `scripts/start-emulators-with-stripe.sh` which also starts a Stripe CLI webhook listener — you need Stripe CLI installed
- Emulator UI: http://localhost:4000 — no service account key needed for emulator-only dev
- Firebase Function exports must be registered in `functions/index.js`; unused/deprecated Genkit edges are commented out there
- `src/config/runtimeConfig.js` is the single source of truth for which backend endpoints are active per environment

## Request Flow Patterns

**Firebase-native**: UI event → Firebase SDK/function call → Firestore update → UI refresh via hooks

**Spring-backed**: UI event → `serviceEndpoints.js` → `ApiService.js` → Spring Boot → response/stream → UI

**Cross-repo AI**: UI prompt → Firebase Function or direct Spring call → Spring planner/chat/voice → stream → UI renders cards
