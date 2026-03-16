# AGENTS.md

Use this file as the starting map for the Airabook frontend repository.

Open the smallest relevant file first, then inspect code.

## Read First
- `/Users/adeshbhattarai/code/Airabook/ARCHITECTURE.md`: frontend architecture, Firebase layout, and cross-repo boundaries.
- `/Users/adeshbhattarai/code/Airabook/README.md`: environment setup, local dev, and deployment flow.
- `/Users/adeshbhattarai/code/Airabook/SELF_UPDATE_WORKFLOW.md`: how to refresh frontend context and memory after meaningful changes.
- `/Users/adeshbhattarai/code/Airabook/MEDIA_STORAGE_AGENT.md`: current Firebase Storage upload/delete/quota workflow, path conventions, and trigger ownership.
- `/Users/adeshbhattarai/code/Airabook/CREDIT_BILLING_AGENT.md`: current subscription tiers, credit wallet, Stripe flows, usage charging, and pricing/business logic.
- `/Users/adeshbhattarai/code/AiraAI/Agent/AGENTS.md`: backend agent map for the Spring Boot + Spring AI repo.

## Repository Identity
- Frontend/UI repo for Airabook.
- Source of truth for React UI, browser routing, Firebase Hosting config, Firestore rules, Storage rules, and Firebase Cloud Functions.
- Backend Spring Boot and Spring AI code lives in `/Users/adeshbhattarai/code/AiraAI/Agent`.

## Repo Map
- `src/`: React/Vite application.
- `src/components/`: reusable UI, chat, planner, dashboard, page editor, and navigation components.
- `src/pages/`: route-level screens.
- `src/services/`: browser-side API clients and integration helpers.
- `src/config/`: runtime and endpoint configuration.
- `src/lib/`: Firebase init, AI stream helpers, validation, utilities.
- `functions/`: Firebase Cloud Functions, Genkit-related code, server-side helpers, flows, tools, and tests.
- `scripts/`: emulator, Stripe, and local helper scripts.
- Root docs: environment setup, Firebase guides, debugging notes, and migration docs.

## Cross-Repo Boundary
Use this repo for:
- React components, layouts, routes, and user interactions
- Firebase Auth/Firestore/Storage client usage
- Firebase Functions code and Genkit/serverless flows
- environment files, Hosting, rules, emulator workflows

Use `/Users/adeshbhattarai/code/AiraAI/Agent` for:
- Spring Boot REST and WebSocket APIs
- Spring AI Alibaba planner/chat/voice orchestration
- Java-side agent tools, prompts, graph workflows, and HITL routing

When a feature touches both repos, inspect both before changing behavior.

## High-Signal Files
- `src/main.jsx`: React entrypoint
- `src/App.jsx`: route tree and authenticated app shell wiring
- `src/config/runtimeConfig.js`: environment-driven runtime config
- `src/config/serviceEndpoints.js`: Spring endpoint mapping and planner/conversation URLs
- `src/services/ApiService.js`: authenticated browser calls into backend APIs
- `functions/index.js`: exported Firebase functions and disabled/active Genkit edges
- `functions/airabookaiStream.js`: streaming AI function path
- `functions/agents/agentServices.js`: server-side agent helper layer
- `functions/flows/`: Genkit flow definitions
- `functions/payments/`: Stripe billing, credit wallet, catalog, and maintenance jobs

## Working Rules
- Prefer the `@/` alias instead of deep relative imports.
- Keep privileged logic in `functions/`, not `src/`.
- If the UI calls Spring endpoints, trace the contract through `src/config/serviceEndpoints.js` and the backend repo.
- If a feature depends on auth or per-user data, follow the full flow through Firebase Auth, browser service layer, and backend/Firebase function boundary.
- Update docs when routes, API boundaries, environment rules, or feature ownership change.
- After meaningful changes, run `scripts/refresh_frontend_context.sh`.

## Build And Verification
- Emulator-first flow: `npm run emulators:local` then `npm start`
- Real dev frontend: `npm run dev`
- Auth sanity: `npm run test:auth`
- Environment deploys: `npm run deploy:dev|qa|go|prod`

## Change Checklist
- Is the change in the correct repo: Airabook vs backend Spring repo?
- If a frontend screen calls Spring, did the request/response contract get checked in both repos?
- If a change affects auth, rules, or permissions, were emulators or environment docs updated?
- If a feature crosses UI + functions + Spring API, are all three seams documented?
