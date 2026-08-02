# Development Profiles

Airabook has two normal local-development profiles and one explicit hybrid profile.

## Profile Matrix

| Command | UI | Auth | Firestore | Storage | Firebase Functions | Data lifetime |
|---|---|---|---|---|---|---|
| `npm run local` | Local Vite | Emulator | Emulator | Emulator | Emulator | Restored/saved in `emulator-data/` |
| `npm run local:web` | Local Vite | Emulator | Emulator | Emulator | Emulator | Requires separately running emulators |
| `npm run dev` | Local Vite | `airabook-dev` | `airabook-dev` | `airabook-dev` | Deployed dev functions | Persistent shared dev data |
| `npm run dev:functions-emulator` | Local Vite | `airabook-dev` | `airabook-dev` | `airabook-dev` | Local functions emulator | Persistent shared dev data |

The profile checks fail before Vite starts if `local` does not target `demo-project`,
or if `dev` does not use the complete `airabook-dev` Web App configuration with
emulators disabled. This includes project number `359520066111`; mixing Web App
credentials from another Firebase project produces valid tokens that dev Firestore
and Functions will reject as unauthenticated.

## Local Profile

Run the complete isolated stack with one command:

```bash
npm run local
```

This starts Vite and the Auth, Firestore, Storage, and Functions emulators. When the
emulators stop cleanly, state is exported to the gitignored `emulator-data/`
directory. The next start imports that state automatically.

Use `npm run local:web` only when emulators are already running in another terminal.
Use `npm run emulators:local` to run the emulator suite without Vite.

Local URLs:

- Web app: `http://localhost:5173`
- Emulator UI: `http://localhost:4000`
- Auth: `127.0.0.1:9099`
- Firestore: `127.0.0.1:8080`
- Storage: `127.0.0.1:9199`
- Functions: `127.0.0.1:5001`

## Dev Profile

Create `.env.development` from `.env.development.example`; it contains the public
Firebase Web App configuration for `airabook-dev`. Restart Vite after changing any
environment value, then run:

```bash
npm run dev
```

The browser runs locally, but Firebase Auth, Firestore, Storage, and callable
Functions all use the deployed `airabook-dev` project. Reads and writes are real,
shared, and persistent. Use test accounts and test data; security rules, triggers,
quotas, emails, Stripe calls, and other side effects can run as they do in dev.

The Spring API remains independent. With the supplied config it is expected at
`http://localhost:8000`; set `VITE_SPRING_API_URL` or `VITE_BACKEND_API_URL` if the
Spring service uses a different origin.

## Hybrid Dev Profile

Use this only when debugging Firebase Functions locally while intentionally reading
or writing real dev data:

```bash
# Terminal 1
npm run emulators:functions:dev

# Terminal 2
npm run dev:functions-emulator
```

The Functions emulator may need Application Default Credentials or a service account
authorized for `airabook-dev`. This mode is intentionally not named `local` because
local function code can mutate persistent dev data.

## What Must Be Running To Test

| Feature under test | Required components |
|---|---|
| Firebase-only UI and CRUD | Selected Firebase profile + Vite |
| Local callable functions/triggers | Full local emulator suite; Storage triggers also require the Storage emulator |
| Planner/chat/voice/video APIs | Vite + selected Firebase profile + Spring backend |
| Stripe checkout/webhooks | Firebase Functions + Stripe test keys; Stripe CLI listener for local webhooks |
| App Check protected dev calls | A valid dev App Check configuration/debug token as appropriate |
| Browser end-to-end tests | All services used by the scenario + Playwright credentials/test user |

## Pre-deploy Checklist

1. Run `npm run profile:check:dev` and `npm run build:dev`.
2. Exercise the changed feature with `npm run dev` against a dev test account.
3. If Functions, rules, or Storage behavior changed, test those seams with emulators first.
4. If a Spring endpoint changed, verify the request/response contract in the Spring repo.
5. Confirm Firebase CLI authentication with `firebase login --reauth` if needed.
6. Deploy dev with `npm run deploy:dev`; this builds in development mode and targets the `dev` alias (`airabook-dev`).
7. Smoke-test `https://airabook-dev.web.app` before promoting the same change to QA or production.

Never run the full emulator suite with `--project dev`. The normal local emulator
alias is `local` -> `demo-project`.
