# Architecture

## Overview

Airabook is the frontend repository for the product. It combines:
- React 18 + Vite UI code
- Firebase client integrations for Auth, Firestore, and Storage
- Firebase Hosting configuration
- Firebase Cloud Functions for serverless operations and some AI-related endpoints
- Browser-side integration points into the Spring Boot backend at `/Users/adeshbhattarai/code/AiraAI/Agent`

This repo is not just UI. It owns both browser code and Firebase-hosted backend logic.

## Main Areas

### `src/`
The React application.

High-signal subareas:
- `components/`: shared widgets and feature UI
- `pages/`: route screens like books, dashboard, media, notes, donate, admin
- `services/`: API wrappers and frontend integration logic
- `config/`: runtime/env resolution and service endpoint mapping
- `context/`: auth/theme providers
- `lib/`: Firebase init, streaming helpers, validation, and utilities

### `functions/`
Firebase Cloud Functions and server-side support code.

High-signal subareas:
- `index.js`: exports and environment initialization
- `airabookaiStream.js`: AI streaming endpoint path
- `agents/`: agent-oriented helper services
- `flows/`: Genkit flow definitions
- `services/`: server-side domain helpers
- `tools/`: function-side tool modules
- `payments/`: Stripe/payment flows
- `tests/`: local and integration scripts

## Runtime Boundaries

### Browser-side frontend
Owned here:
- routing
- page state and UI interactions
- Firebase client SDK usage
- calling Firebase Functions
- calling Spring endpoints from the browser

Key files:
- `src/App.jsx`
- `src/config/runtimeConfig.js`
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`

### Firebase Functions backend
Owned here:
- callable functions
- auth-backed Firestore mutations
- server-side AI or streaming helpers that still live in Firebase
- payments and webhook integrations

Key files:
- `functions/index.js`
- `functions/airabookaiStream.js`
- `functions/agents/agentServices.js`
- `functions/flows/*`

### Spring backend
Owned in `/Users/adeshbhattarai/code/AiraAI/Agent`:
- Spring Boot REST endpoints
- planner/chat/voice streaming and orchestration
- Spring AI Alibaba ReactAgent/Graph flows
- Java-side tools, prompts, and memory-aware workflows

Frontend Spring integration points currently show up in:
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`
- feature-specific browser services under `src/services/`

### Enterprise onboarding administration
- The System Admin queue is routed at `/admin/enterprise-approvals` and rendered by `src/pages/admin/EnterpriseApprovals.jsx`.
- Queue, detail, approve, and decline calls use `/api/v1/admin/enterpriseOnboardingRequest` through `src/services/enterpriseOnboardingService.js`.
- The route and Admin navigation visibility resolve `SYSTEM_ADMIN` from the authenticated Spring `/api/v1/me` response. The backend controller is `agent/src/main/java/com/ethela/agent/controller/EnterpriseOnboardingAdminController.java` in the Spring repo; authorization remains enforced by its `SYSTEM_ADMIN` role requirement.

### Post-login workspace routing
- Firebase login/signup (legacy and v2, email and Google) loads `/api/v1/me`. Only a single active Personal workspace without System Admin access skips selection and enters `/dashboard`. All other users enter the standalone `/v2/chooseWorkspace` page. A saved preference never bypasses this post-login choice.
- `WorkspaceChooser` lists active Enterprise workspaces and Personal access, plus a distinct Admin dashboard row only for backend `SYSTEM_ADMIN`. It revalidates `/me` on selection and preserves deep links only inside the selected destination category.
- Personal pages retain `AppShell`; Enterprise pages use their own sidebar/header; platform administration uses the separate `AdminShell`. Personal navigation no longer mixes platform Admin links into its sidebar. Each shell offers an in-place Switch workspace dropdown and a shared profile menu with identity and sign-out. Desktop profiles use a workspace submenu; mobile profiles expand choices in the same popover. The active destination is checked, and selecting it preserves the current page. Other selections route directly into the appropriate shell, not the login chooser.
- `WorkspaceMenu.jsx` and `useWorkspaceMenu.js` load current `/me` access when opened and revalidate before selection. Only `SYSTEM_ADMIN` adds the Admin destination. Failed loads/selections stay in the menu with retry. Browser preferences remain non-authoritative.
- Enterprise URLs include `accountId` (`/v2/enterprise-home?accountId={id}`), which is validated against `/me` on refresh. A missing/unauthorized explicit ID never silently falls back to another team. A valid saved preference still supports older Enterprise URLs without an ID; it is never an authorization credential.
- `/v2/workspaces` is the Personal-shell hub for active workspaces, invitations, and onboarding requests. It preserves the Personal sidebar, desktop/mobile top navigation, profile menu, and theme, including on refresh and during loading/errors. Only `/v2/chooseWorkspace` is the standalone post-login chooser. Enterprise APIs still authorize the requested account on each call.
- Enterprise signup and requester status use `/api/v1/enterpriseOnboardingRequest` and `/api/v1/enterpriseOnboardingRequest/mine`, connecting the user's status UI to the same request records reviewed by the Step 6 admin dashboard.
- System Admin access is presented separately from workspace cards and continues to be authorized by the backend role.
- See `WORKSPACE_SELECTION.md` for the routing contract and browser regression commands.

### Enterprise team administration (Step 8)
- `EnterpriseHome` renders `components/workspace/EnterpriseTeamManagement.jsx` with current memberships, the caller's workspace role, and invitation history. Every mutation reloads `/me` and the member/invitation lists.
- Owners invite `ADMIN` or `MEMBER`, change non-owner roles, and suspend/restore/remove non-owner members. Admins invite and manage `MEMBER` access only. The protected owner cannot be changed through this screen.
- Role/status patches and soft removal use `/api/v1/enterprise/accounts/{accountId}/members/{userId}/role`, `/status`, and `DELETE` on the member resource. Search uses the camelCase `/eligibleUsers` endpoint; the backend retains the former hyphenated alias.
- Removed membership records stay in PostgreSQL as `REMOVED`. Rejoining requires a new invitation and recipient acceptance. Suspended members can be restored by an authorized administrator.
- Invitation acceptance/decline remains in `/v2/workspaces`. The team screen lists invitation history by status and can revoke pending invitations within the caller's role authority. Email delivery belongs to Step 9.
- Backend migration `013_account_invitations.sql` must be applied after `001`–`012` before using the updated backend. It preserves invitation data and supplies an updatable `enterprise_invitations` compatibility view.
- `npm run test:enterprise-team` runs isolated browser regression fixtures using real screens and API clients with mocked identity/API responses; it does not use Firebase credentials or write to Supabase. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome instead of bundled Chromium.

## Request Path Patterns

### Enterprise operations (Step 9)
- The existing Enterprise approval dialog reads the optional business-verification
  policy/history and records PASSED/FAILED results through the backend's protected
  `/api/v1/admin/enterpriseOnboardingRequest/{requestId}/verifications` resource.
  Required verification disables approval until the latest result passes; policy
  load failure keeps approval disabled. The backend independently enforces the gate.
- The dashboard's Notification delivery panel uses `/api/v1/admin/enterpriseOperations`
  to inspect queued/failed email and requeue dead letters. SMTP settings stay exclusively
  in backend environment configuration. Rate limiting is deferred at the owner's request.
- Apply backend migration `014_enterprise_operations.sql` before deploying these screens.
  Verification, SMTP delivery, and retention cleanup are off by default; the full
  configuration guide is `Agent/docs/ENTERPRISE_WORKSPACE_STEP9_IMPLEMENTATION.md`.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.operations.config.mjs`
  validates verification-gated/default approval, failed/history-error states, and
  email recovery using mocked API data without external Firebase/Supabase writes.

### Firebase-native feature
1. UI event in `src/components/` or `src/pages/`
2. Client service or Firebase SDK call
3. Firebase Function and/or Firestore update
4. UI refresh through state/context/hooks

### Spring-backed feature
1. UI event in browser
2. endpoint resolution through runtime config and service endpoints
3. authenticated request through `ApiService` or feature service
4. Spring Boot backend handles planner/chat/voice/API logic
5. UI consumes response or stream

### Cross-repo AI feature
1. UI issues prompt or action
2. request may go to Firebase Functions or directly to Spring
3. Spring may run planner/chat/voice orchestration
4. response/stream returns to browser
5. UI renders cards, events, or assistant output

## Design Rules
- Keep browser-only code in `src/`.
- Keep privileged mutations and secrets in `functions/` or the Spring backend, never in client code.
- When the frontend references a Spring endpoint, document the backend file or route that owns it.
- When deprecating Firebase AI paths in favor of Spring, leave the boundary explicit rather than ambiguous.

## Firebase Security Model
- `firestore.rules` treats top-level `albums` documents as server-authoritative. Client reads are allowed by access rules, but create/update/delete should go through Firebase Functions using the Admin SDK.
- `firestore.rules` treats top-level `books` creation as server-authoritative. The only direct client mutation intentionally left open on the root book doc is the owner's `isPublic` publish toggle.
- Chapter and page documents are still client-accessible for owners/co-authors under the existing collaboration model.
- `storage.rules` gate raw file writes separately from Firestore. When a feature touches upload permissions, trace both `storage.rules` and the related Firestore access documents together.

## First Files To Inspect For Most Tasks
- `src/App.jsx`
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`
- `functions/index.js`
- `/Users/adeshbhattarai/code/AiraAI/Agent/AGENTS.md`
