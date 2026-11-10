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

### System Admin user directory
- `/admin` lists PostgreSQL application users via `adminUsersService.js` and the existing `GET /api/v1/users` endpoint. Firebase supplies the bearer token; PostgreSQL `SYSTEM_ADMIN` authorizes the request, not a Firebase custom admin claim.
- The API retains its `{ status: true, data: [...] }` envelope and legacy fields, adding canonical `displayName`, `systemRole`, and `emailVerified` to the directory. The UI shows platform role, account status, and email verification; errors/malformed responses are not presented as empty lists.
- This is an application-user directory, not a Firebase Auth inventory: existing Firebase identities appear after backend synchronization. It includes Personal users, Enterprise members, and System Admins once each, including inactive records.
- Firestore billing/storage reporting and `recalculateStorageUsage` are not migrated. The directory no longer displays fabricated Free/zero-storage defaults or invokes the legacy Firebase-admin-only storage action.
- Workspace browser regressions exercise the real directory and client against mocked backend responses, including refresh, access denial, session expiry, retry, invalid envelopes, empty results, and blocked Enterprise-admin access.

### Post-login workspace routing
- `/v2/login` and `/v2/personal-login` render the same general sign-in screen, and `/v2/personal-signup` creates a general Airabook account. Authentication screens have no Enterprise selector or request notice; Enterprise requests remain available after authentication. Incoming return-route state is preserved.
- Public login/signup routes reuse `Login.jsx` and `Signup.jsx` inside `MarketingLayout`, restoring the original centered, rounded card, gradient background, and public header. The v2 entries are thin wrappers around those same screens; Enterprise onboarding retains its separate auth layout and styling.
- Workspace, Enterprise onboarding, team management, and platform review screens reuse the existing shared Button, Input/AppInput, Textarea, and dropdown defaults. Card surfaces use the same rounded-2xl treatment as InfoCard/StatCard; fields and native selects use rounded-md, buttons retain their shared 4px default, and menus retain their shared rounded-md/rounded-sm hierarchy. WorkspaceUI centralizes semantic badges and notices for all themes. The standalone chooser uses the reference list layout with a scoped white palette, preserving the saved app theme that Enterprise and other shells load. Public login/signup retain their existing design.
- Firebase login/signup (legacy and v2, email and Google) loads `/api/v1/me`. Only a single active Personal workspace without System Admin access skips selection and enters `/dashboard`. All other users enter the standalone `/v2/chooseWorkspace` page. A saved preference never bypasses this post-login choice.
- `WorkspaceChooser` lists active Enterprise workspaces and Personal access, plus a distinct Admin dashboard row only for backend `SYSTEM_ADMIN`. It revalidates `/me` on selection and preserves deep links only inside the selected destination category.
- Personal and Enterprise pages share `AppShell`, including the creation dashboard, content navigation, desktop header, mobile drawer, and theme. Enterprise adds an Administration sidebar entry at `/v2/enterprise-home/administration?accountId={id}` for the existing organization/team screen; `/v2/enterprise-home?accountId={id}` now opens `Dashboard`. Platform administration retains the separate `AdminShell`. Personal navigation no longer mixes platform Admin links into its sidebar. Each shell offers a shared profile menu with identity, in-place workspace switching, and sign-out. Sidebar switchers remain available; the Enterprise header uses only the profile menu for switching. Desktop profiles use a workspace submenu; mobile profiles expand choices in the same popover. The active destination is checked, and selecting it preserves the current page. Other selections route directly into the appropriate shell, not the login chooser.
- Personal, Enterprise, and platform Admin shells render the same `components/navigation/Sidebar.jsx` with a destination mode. The shared sidebar owns branding, navigation rows, the active left border, footer, saved desktop collapse preference, and the mobile drawer; Admin mode supplies platform links and omits Personal credit usage. Admin content scrolls inside the viewport like the Personal shell.
- `WorkspaceMenu.jsx` and `useWorkspaceMenu.js` load current `/me` access when opened and revalidate before selection. Only `SYSTEM_ADMIN` adds the Admin destination. Failed loads/selections stay in the menu with retry. Browser preferences remain non-authoritative.
- `AppQueryProvider.jsx` creates an in-memory TanStack Query client per authenticated session. Workspace access, members, and invitation queries use a one-minute freshness window and 15-minute unused retention. Auth changes clear the old cache and cancel supported requests. `enterpriseQueries.js` centralizes keys by user, account, role, resource, and invitation status. The shared HTTP client forwards AbortSignal for these reads; Spring endpoints and payloads are unchanged.
- Fresh `/me` responses from chooser/menu selections seed the access cache, while those selections still revalidate against the backend. `WorkspaceContext` subscribes to the cached profile, prefetches members and permitted pending invitations after Enterprise selection without blocking common pages, and removes caches for inaccessible accounts or former roles. Administration uses the same query keys, deduplicates in-flight preloads, reuses fresh data, and shows cached rows during stale background refresh. Mutations/manual refresh invalidate all filters for the account, refresh `/me`, and fetch the current member/invitation data. MEMBER roles never request invitation history.
- `WorkspaceContext.jsx` validates explicit Enterprise URLs and legacy Enterprise-route preferences against current `/me` access. Personal URLs render immediately without an extra workspace-access request; a saved Personal ID never blocks the page. Validated in-memory Enterprise context is retained for ordinary in-app actions that omit `accountId`. Enterprise navigation carries `accountId` across content, settings, and hub routes; ordinary page actions recover it from the validated selection and canonicalize the URL. Choosing Personal clears Enterprise query context from return links. Invalid/revoked workspace IDs return to the chooser; Enterprise validation runs in the background for common pages, which render immediately on entry, navigation, and refresh. Access-service errors show a non-blocking notice with retry above those pages. Only Administration waits for validated access before mounting its account-scoped content. Enterprise navigation and a generic Enterprise subtitle appear immediately; validated membership supplies the organization name and permissions. This UI reuse retains the existing Firebase user/book access model; it does not migrate content, billing, or AI histories into account-scoped storage.
- Enterprise URLs include `accountId` (`/v2/enterprise-home?accountId={id}`), which is validated against `/me` on refresh. A missing/unauthorized explicit ID never silently falls back to another team. A valid saved preference still supports older Enterprise URLs without an ID; it is never an authorization credential.
- `/v2/workspaces` is the shared-app hub for active workspaces, invitations, and onboarding requests. It preserves the current workspace sidebar, desktop/mobile top navigation, profile menu, and theme, including on refresh and during loading/errors. Only `/v2/chooseWorkspace` is the standalone post-login chooser. Enterprise APIs still authorize the requested account on each call.
- Enterprise signup and requester status use `/api/v1/enterpriseOnboardingRequest` and `/api/v1/enterpriseOnboardingRequest/mine`, connecting the user's status UI to the same request records reviewed by the Step 6 admin dashboard.
- System Admin access is presented separately from workspace cards and continues to be authorized by the backend role.
- See `WORKSPACE_SELECTION.md` for the routing contract and browser regression commands.

### Enterprise API key access
- Administration's top-right Get API key control renders `EnterpriseApiKeyDialog.jsx` for workspace OWNER or backend SYSTEM_ADMIN, matching `ApiKeyServiceImpl.getApiKey` in the Spring repo. ADMIN and MEMBER do not gain key access from their workspace role.
- The dialog reads authenticated `GET /api/v1/apiKey?accountId={id}` through the restored `apiKeyService.js` from the existing `api-key-ui` implementation. Its `{ status: true, data }` envelope and account identity are validated before display. The original compact dialog, selectable key field, website panel, copy fallback, and error/retry states are preserved. No key is created or rotated here; missing keys refer the user to a system administrator.
- Secret reads run only while the dialog is open. The original component stores details only in local state, clears them on close, and ignores late responses after closing or switching accounts. Keys are excluded from background Administration prefetch and persistent storage. Backend authorization remains authoritative.

### Enterprise team administration (Step 8)
- `EnterpriseHome` renders `components/workspace/EnterpriseTeamManagement.jsx` with current memberships, the caller's workspace role, and invitation history. Every mutation reloads `/me` and the member/invitation lists.
- Owners invite `ADMIN` or `MEMBER`, change non-owner roles, and suspend/restore/remove non-owner members. Admins invite and manage `MEMBER` access only. The protected owner cannot be changed through this screen.
- Role/status patches and soft removal use `/api/v1/enterprise/accounts/{accountId}/members/{userId}/role`, `/status`, and `DELETE` on the member resource. Search uses the camelCase `/eligibleUsers` endpoint; the backend retains the former hyphenated alias.
- Removed membership records stay in PostgreSQL as `REMOVED`. Rejoining requires a new invitation and recipient acceptance. Suspended members can be restored by an authorized administrator.
- Invitation acceptance/decline remains in `/v2/workspaces`. The team screen lists invitation history by status and can revoke pending invitations within the caller's role authority. Enterprise email delivery is deferred pending the Firebase integration design.
- Backend migration `013_account_invitations.sql` must be applied after `001`–`012` before using the updated backend. It preserves invitation data and supplies an updatable `enterprise_invitations` compatibility view.
- `npm run test:enterprise-team` runs isolated browser regression fixtures using real screens and API clients with mocked identity/API responses; it does not use Firebase credentials or write to Supabase. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome instead of bundled Chromium.

### Enterprise compatibility cleanup (Step 10)
- The request form calls `submitEnterpriseOnboardingRequest` against the canonical
  `/api/v1/enterpriseOnboardingRequest` API; it does not create a workspace before approval.
- Unused account-first creation/login/review endpoint settings and client helpers,
  the obsolete Enterprise login screen, and its private account switcher are removed.
  `/v2/enterprise-login` remains a redirect to general Firebase sign-in.
- Workspace context still comes from `/me`; invitation/team and request-review APIs
  remain active. Firebase signup-verification and password-reset emails are untouched.
- Retired backend routes return authenticated `410 Gone` replacement instructions;
  generic account metadata updates cannot change workspace lifecycle status.

## Request Path Patterns

### Enterprise operations (Step 9)
- The existing Enterprise approval dialog reads the optional business-verification
  policy/history and records PASSED/FAILED results through the backend's protected
  `/api/v1/admin/enterpriseOnboardingRequest/{requestId}/verifications` resource.
  Required verification disables approval until the latest result passes; policy
  load failure keeps approval disabled. The backend independently enforces the gate.
- SMTP/outbox email delivery and its Admin delivery panel/API have been removed pending
  a Firebase-based delivery design. Enterprise verification and audit history remain;
  optional PII cleanup also remains on the backend. The already-applied migration 014
  is retained unchanged, with its outbox table dormant. Rate limiting remains deferred.
- `PLAYWRIGHT_CHANNEL=chrome npx playwright test --config playwright.operations.config.mjs`
  validates verification-gated/default approval, failed/history-error states, and
  verification flows using mocked API data without external Firebase/Supabase writes.

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

## Journal writing workspace

Standard writing pages are vertically stacked entries with a compact page header and optional word-count guidance. Their content grows within its original page; only explicit fixed paper layouts enable automatic block reflow. Navigation saves all dirty mounted entries before leaving, and page/chapter source IDs remain stable for deep links and future citations. See [JOURNAL_WORKSPACE.md](JOURNAL_WORKSPACE.md) for the interaction contract, browser regression, and the current SDK/document-retrieval boundary.

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
