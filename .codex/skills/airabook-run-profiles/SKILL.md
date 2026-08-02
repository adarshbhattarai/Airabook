---
name: airabook-run-profiles
description: Launch, inspect, troubleshoot, test, or prepare deployment of the Airabook frontend using its local-emulator, persistent dev-data, or hybrid local-Functions profiles. Use when asked to start or launch Airabook, run the app locally, use Firebase emulators, preserve local emulator data, connect to airabook-dev data, debug Firebase Functions locally against dev, determine required services, or verify readiness for a dev deployment.
---

# Airabook Run Profiles

Operate Airabook with an explicit Firebase profile and avoid accidental cross-environment writes.

## Read First

Read `../../../DEVELOPMENT_PROFILES.md` before launching, troubleshooting, or preparing a deployment. Treat it as the current profile and component matrix.

## Select the Profile

- Choose `local` for isolated development unless the user explicitly asks for persistent dev data. Run `npm run local`; it starts Vite plus Auth, Firestore, Storage, and Functions emulators. Emulator state imports from and exports to `emulator-data/` on clean shutdown.
- Choose `local:web` only when a compatible emulator suite is already running. Run `npm run local:web`.
- Choose `dev` when the user explicitly wants real persistent `airabook-dev` data. Run `npm run dev`; it uses real dev Auth, Firestore, Storage, and deployed Firebase Functions.
- Choose the hybrid profile only when the user explicitly wants local Firebase Functions with real dev data. Run `npm run emulators:functions:dev` and `npm run dev:functions-emulator` in separate processes.

Never start the full emulator suite with `--project dev`. The isolated emulator alias is `local`, mapped to `demo-project`.

## Launch Workflow

1. Work from the Airabook repository root.
2. Inspect ports `4000`, `5173`, `9099`, `8080`, `9199`, and `5001` before starting a new stack. Reuse or report an existing compatible Airabook stack; do not kill user processes without an explicit request.
3. Run `npm run profile:check:local` or `npm run profile:check:dev` for the selected profile.
4. Start the selected command in a PTY or persistent execution session so the app remains running.
5. Confirm the actual Vite URL and relevant Firebase endpoints from startup output. Vite may choose another port when `5173` is occupied.
6. Report which profile is active, whether data is isolated or persistent, the web URL, and any unavailable optional component.

Do not silently fall back from `local` to dev or from dev to local. Stop and report a failed profile check.

## Service Boundaries

- Firebase-only screens need Vite plus the selected Firebase profile.
- Planner, chat, voice, and video features also need the Spring backend configured by `VITE_SPRING_API_URL` or `VITE_BACKEND_API_URL`.
- Local Stripe webhook testing needs Stripe test credentials and the Stripe CLI listener. A Stripe failure does not justify switching Firebase profiles.
- Storage-trigger testing needs both Storage and Functions emulators in local mode.
- App Check protected dev calls need valid dev App Check configuration.

## Dev Safety

Before using `dev`, explicitly tell the user that reads and writes affect shared persistent `airabook-dev` data. Local code can trigger dev quotas, emails, payments, storage triggers, and other side effects.

Do not create test data, seed dev, run hybrid Functions, deploy, reauthenticate Firebase, or stop existing services unless the user's request authorizes that action.

## Verification and Deployment

- Validate configuration with `npm run profile:check:dev`.
- Build with `npm run build:dev`.
- Test changed Firebase Functions, Firestore rules, and Storage rules with local emulators before dev deployment.
- Verify Spring contracts in the backend repository when a feature crosses that boundary.
- Check Firebase CLI authentication before deployment; request reauthentication if needed.
- Run `npm run deploy:dev` only when the user explicitly asks to deploy.
- Smoke-test `https://airabook-dev.web.app` after a successful dev deployment.
