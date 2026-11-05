# Workspace selection and in-app switching

Implemented 2026-10-02. Firebase remains the authentication provider; Spring `/api/v1/me`
supplies application roles and current workspace memberships. This is a frontend change;
no database migration, Firebase claim change, or API contract change is required.

## Entry flow

- Email and Google authentication on both legacy and v2 login/signup pages load `/me`.
- Exactly one active Personal workspace, without System Admin access, enters the Personal
  dashboard directly. Valid Personal deep links retain their query and hash.
- Other users enter `/v2/chooseWorkspace`, a standalone white selection page without a sidebar or outer card.
- Each active Enterprise workspace and the Personal account have separate rows. `SYSTEM_ADMIN`
  adds an **Admin dashboard** row. Enterprise `OWNER` or `ADMIN` does ot grant this row.
- A saved workspace preference does not bypass the chooser on a new sign-in.
- Missing access or backend errors do not silently open a Personal dashboard. The chooser
  provides an empty/error state, retry, invitations/requests access, and sign-out.

## Destinations and shells

| Choice | Destination | Layout |
| --- | --- | --- |
| Personal account | `/dashboard` or matching Personal deep link | Existing `AppShell` and Personal sidebar |
| Enterprise workspace | `/v2/enterprise-home?accountId={id}` | Shared `AppShell` and creation dashboard, with an extra Administration entry |
| Admin dashboard | `/admin/enterprise-approvals` or matching Admin deep link | Dedicated `AdminShell` and platform navigation |

The platform Admin shell includes onboarding review and the existing Users & resources
page at `/admin`. Personal navigation no longer includes platform administration links.
Personal, Enterprise, and Admin render the same `Sidebar` component, with destination-specific
links and identity subtitles. They share the Airabook logo, section heading/row
spacing, active left-edge indicator, footer controls, saved desktop collapse state,
and mobile drawer at the same breakpoint. Admin content scrolls separately from
its sidebar/header, like Personal content. Personal credit usage remains in the
Personal sidebar.
All shells offer **Switch workspace** as an in-place dropdown, not a redirect to the
login chooser. Their profile menus show the user's name/email, workspace choices, and
**Sign out**. Personal and Enterprise retain **Profile Settings**. Desktop profile menus use a nested
workspace submenu; narrow mobile screens expand the choices inside the same popover.
The active destination has a checkmark, including the separate platform Admin context.
Choosing another workspace navigates directly to its landing page in the appropriate layout. Choosing the current
destination closes the menu without resetting the current page/query/hash.
The `/v2/workspaces` invitation/request hub renders inside the shared `AppShell`,
preserving its sidebar, desktop/mobile top navigation, profile menu, and theme.
This also applies to direct navigation, refresh, loading, and API error states. Its
back link returns to `/dashboard` without dropping the shell. The standalone
post-login chooser remains `/v2/chooseWorkspace`.

Enterprise workspaces reuse the Personal creation dashboard, Books, Movies (when books are available), Asset Registry, header, and footer. Their sidebar adds an **Enterprise** section containing **Administration**. That entry opens the existing organization overview and team management at `/v2/enterprise-home/administration?accountId={id}`. Personal has no Administration entry.

`WorkspaceContext.jsx` validates Enterprise URLs (or a saved preference on legacy Enterprise routes) against `/me`, keeps the validated organization across shared app pages, and adds `accountId` to ordinary page-action URLs. Personal URLs render immediately without an extra `/me` request or workspace-loading replacement, even with a saved Personal preference. Switching still validates access before navigation. The profile and sidebar switchers check the current organization on these pages. Enterprise Dashboard, Books, Movies, Asset Registry, and other common pages also render immediately while validation runs in the background. The sidebar displays Enterprise navigation immediately, using a generic subtitle until the validated account name is available. Validation failures show a non-blocking retry notice above common content. Only Administration waits for validated access; invalid explicit IDs still return to the chooser without falling back to another organization.

Content, search, usage/billing, and AI histories continue using their existing Firebase user/book access model. This layout change introduces no account-level content migration or new API contract. Team administration retains its account-scoped API and role permissions.

Each Enterprise URL identifies its own account. Refresh validates that ID against current `/me` memberships. An inaccessible
explicit ID returns to the chooser instead of falling back to another Enterprise account.
Old URLs without an ID retain compatibility with a valid saved preference or sole
accessible Enterprise workspace.

## Administration preloading and caching

TanStack Query owns workspace access, Invitations & requests, and Administration server data; React Context
still owns the selected-workspace UI. `AppQueryProvider` creates a query client per
authenticated session, with `staleTime: 60_000` and `gcTime: 900_000`. Data stays in
memory; full browser reload starts a new cache. Sign-out or identity changes clear
the previous client and cancel its query requests.

After authorized Enterprise selection, the shared provider prefetches members and
pending invitations (OWNER/ADMIN only) without blocking Dashboard or other common
pages. Administration subscribes to those same queries. It joins an existing
request, renders fresh data immediately on revisits, and keeps cached rows visible
while stale data refreshes. Cold entry can still show local team/invitation loading.
The existing Refresh team action remains available.

Keys include Firebase UID, account ID, role, resource, and invitation status.
Fresh `/me` responses from menu/chooser authorization seed the access query so entry
does not repeat that request. Removed accounts and old roles have their
Administration caches removed. Every mutation/conflict/manual refresh invalidates
all Administration filters for that account, revalidates `/me`, and reloads current
members and the selected invitation status. Privileged controls disappear on role
changes; backend permissions still authorize each request. Access-denied data
responses hide cached team rows and controls. Network failures retain readable
cached rows with retry.

The existing Spring `/me`, member, and invitation APIs are unchanged. Browser
request options now forward AbortSignal so canceled queries and signed-out sessions
can abort outstanding reads. Existing content, billing, and AI-history caches are
outside this change.

## API key dialog

Administration includes a Get API key action at the top-right for workspace owners
and System Admins. It calls the existing authenticated `GET /api/v1/apiKey?accountId={id}`
only when opened. The response envelope and account ID are checked, and the key is
shown in the original selectable field with copy controls. Missing keys and access errors have retry states;
key creation/rotation remains outside this screen.

The existing dialog and `apiKeyService.js` are restored from commit `7635dc1`,
preserving the previous layout and local-state fetching. Key details are not part
of background prefetch or browser storage. Closing clears local state, and the
original response guards ignore late responses after closing or switching accounts. Reopening
fetches a fresh value. Backend OWNER/SYSTEM_ADMIN permission checks still apply.

The selected Enterprise account's website from `/me` is also preserved in the
Administration overview. Valid HTTP/HTTPS links open in a new tab and wrap on
mobile; invalid or missing websites are omitted.

## Shared appearance

Workspace pages follow the existing application components: `Button` supplies its
4px corners and primary/outline/ghost variants; `Input`, `AppInput`, `Textarea`, and
`NativeSelect` share the 6px field treatment and theme focus ring. `Card` matches the
24px `InfoCard`/`StatCard` surfaces, including the existing Matrix surface styling.
Menus keep the shared 6px container and 4px row corners. Nested panels and navigation
use the existing rounded-xl treatment, while avatars stay circular and status badges use pills.

The Personal hub, Enterprise shell, request form/status, team dialogs, and
Admin review screens use theme colors instead of a separate hardcoded palette.
`WorkspaceUI.jsx` and `workspace.css` provide common success, warning, danger, and
neutral notices/badges with readable colors in light, Matrix, and dark themes.
The chooser uses a white list layout with colored destination avatars and thin
dividers. Its palette is scoped to the chooser, so the saved application theme is
preserved for the selected destination. Enterprise home loads that saved theme on
direct entry.

## Authorization and state

The chooser and in-app menus re-fetch `/me` when a row is selected. Menus also load
fresh memberships whenever opened. Removed/suspended memberships,
inactive accounts, and revoked System Admin access cannot be entered using stale rows.
Stored IDs and browser route state are navigation preferences, not credentials. Existing
backend account and System Admin authorization continues to protect every API operation.
Return locations cannot skip selection or navigate to a different destination category.
In-app load/selection failures remain inside the dropdown with retry; they do not
redirect to the chooser or silently enter another workspace. Sign-out failures retain
the menu and show an error. The shared menu lives in
`src/components/workspace/WorkspaceMenu.jsx`, with access/loading/selection behavior
in `src/hooks/useWorkspaceMenu.js`.

## UI consistency verification (2026-10-16)

The workspace-selection, Enterprise-team, and Enterprise-operations suites covered
70 browser cases using mocked identity/API responses and the installed Chromium.
The first combined run passed 69 cases; one browser closed before the 390px review
layout check could start. That case and two Enterprise routing/mobile-menu checks
passed in a focused rerun (3 passed, no failures). Existing style assertions now
follow the shared button, field, card, dialog, and menu defaults described above.
The production build and focused undefined-variable, unused-variable, and React
hook checks passed. Desktop/mobile previews were inspected in light, dark, and
Matrix themes; these checks did not exercise live Firebase or PostgreSQL services.

## Admin sidebar follow-up verification (2026-10-16)

Admin now renders the same `Sidebar` as Personal. Two new browser regressions
cover collapse persistence across refresh/workspace switching and mobile drawer
navigation/dismissal. A focused run also checked eight existing workspace,
directory, Personal-shell, and Admin-menu cases: **10 passed, 0 failed, 0 skipped**.
The production build and focused React-hook, unused-variable, and undefined-variable
lint checks passed. Identity and API responses were mocked. Desktop, collapsed, dark-theme, and mobile
previews were inspected; corresponding Admin/Personal navigation rows had equal
computed font size, padding, radius, active border, and text color.

The recorded local command was `node /tmp/check-admin-sidebar.mjs`, which ran the
workspace suite through a temporary config selecting installed `/usr/bin/chromium`,
captured previews, and stopped its temporary Vite server. The durable new cases
can be run with:

```sh
npx playwright test --config playwright.workspaces.config.mjs --grep 'Admin sidebar collapse|Admin mobile drawer'
```

## White workspace chooser follow-up verification (2026-10-16)

The chooser follows the reference's centered list, circular colored avatars, thin
row dividers, and understated footer links on a white background. Its scoped
palette preserves the saved application theme when opening a workspace.
Six focused browser cases passed with no failures or skips, including a new
regression for a white chooser with a saved dark application theme. Identity and
API responses were mocked; no live Firebase or database writes were exercised.
Desktop (891px), mobile (390px), and error-state previews were inspected; neither
viewport had horizontal overflow. Focused component lint checks and the production
build passed.

The recorded local command was `node /tmp/check-white-chooser.mjs`, using installed
`/usr/bin/chromium` and a temporary Vite server. The durable new case can be run with:

```sh
npx playwright test --config playwright.workspaces.config.mjs --grep 'workspace chooser stays white'
```

## Shared Personal/Enterprise layout verification (2026-11-02)

Enterprise now opens the real creation dashboard inside `AppShell`; the existing
organization/team screen is reached through its additional Administration entry.
The workspace suite adds desktop/mobile navigation, content-page refresh, ordinary
page actions, retry, and unauthorized shared-page checks. The creation-page scenario
uses the production Dashboard; unrelated content-page bodies remain fixture stubs.

Verification used installed `/usr/bin/chromium` through a temporary config extending
`playwright.workspaces.config.mjs`:

- Focused shared-layout browser run: **6 passed, 0 failed, 0 skipped**.
- Full workspace/team run: **70 passed, 1 failed, 0 skipped**. Chromium closed before
  the remaining test loaded the app; its focused rerun passed (**1 passed, 0 failed,
  0 skipped**), covering all 71 cases across runs.
- `npm run test:workspace-routing` and `npm run build` passed. Changed shell/context,
  navigation, menu, team-screen, routing, and test files passed focused lint checks.
  Dashboard retains its pre-existing `submitPrompt` effect-dependency warning.
- Desktop dashboard/Administration and mobile drawer previews were inspected.
  Identity and backend responses were mocked; live Firebase/PostgreSQL behavior
  and account-scoped content migration were not exercised.

Recorded browser commands:

```sh
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'revoked workspace access stays'
```

## Personal loading follow-up (2026-11-02)

The shared workspace provider initially treated every stored workspace ID as an
Enterprise access check. That added a second `/me` request after Personal selection
and replaced normal Personal content during page loads and refreshes. Personal URLs
now render immediately. Enterprise access still validates explicit account IDs;
legacy Enterprise routes can restore a saved preference, and ordinary in-app actions
retain only the current user's already validated Enterprise selection.

Four regressions cover Personal Dashboard/Books/Asset Registry loads and refreshes
with `/me` unavailable, plus Enterprise-to-Personal switching with only the required
selection request. A focused run including existing Enterprise navigation, mobile,
access-error, and profile-switching scenarios passed **12 tests, 0 failures, 0 skips**:

```sh
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'workspace-access gate|does not repeat access|Enterprise choice opens|Enterprise shares|Enterprise mobile drawer|Enterprise context survives|Enterprise shared-page|unauthorized Enterprise account|Personal-only login skips|profile menu switches directly'
```

These checks use mocked identity/API responses. Routing checks and focused lint passed.

## Immediate Enterprise common-page rendering (2026-11-02)

The shared shell now mounts common page content immediately while Enterprise
membership validation runs in the background. Dashboard, Books, Movies, and Asset
Registry were each tested with the `/me` response deliberately withheld, both on
entry and refresh. The production Dashboard and Enterprise navigation remained
visible; the sidebar uses an Enterprise subtitle until the verified name arrives.
A failed background check shows a retry notice without replacing common content.
Administration still waits for validated access before mounting its team screen.

The focused browser run passed **16 tests, 0 failures, 0 skips**, including the
four delayed-response cases, Administration gating, Personal loading, switching,
mobile navigation, retry, and invalid-account redirection. Build, routing checks,
focused lint, and whitespace checks passed. The pending-validation Dashboard
preview was inspected. Identity and API responses were mocked.

```sh
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'renders before workspace|Administration waits|workspace-access gate|does not repeat access|Enterprise choice opens|Enterprise shares|Enterprise mobile drawer|Enterprise context survives|Enterprise shared-page|unauthorized Enterprise account|profile menu switches directly'
```

## TanStack Query Administration cache verification (2026-11-02)

TanStack Query 5 is installed for workspace access and Administration server data.
The full workspace/team browser run passed **86 tests, 0 failures, 0 skips**. Two
additional error regressions then passed (**2 passed, 0 failures, 0 skips**), giving
88 distinct cases verified across those runs. A final auth-boundary run passed
10 tests (0 failures/skips), including an additional direct identity-change case,
bringing the distinct verified cases to 89. Cache scenarios cover automatic
prefetch, joining an in-flight request, repeat visits without additional reads,
organization isolation, manual refresh without hiding rows, invitation-filter
caches, role demotion, sign-out/session reset, stale background refresh, failed
preloads, and denied cached data. Existing team mutations and membership conflicts
remain covered by the team suite.

The query client and its observers are recreated on auth identity changes inside
a stable Router, so email/Google login, return routes, and same-user sign-in after
logout retain their navigation. A direct user-to-user auth change is also tested
for private-data isolation and cache reuse under the new identity. Sign-out clears the previous client and cancels query reads. The
standalone team fixture now uses the production query/workspace providers.

Commands used installed `/usr/bin/chromium` through the temporary config:

```sh
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'failed Administration prefetch|access-denied team responses'
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'authenticated user changes directly|Administration clears|Enterprise choice opens|Personal-only login skips|profile menu signs out|Google authentication uses'
```

The production build, routing checks, focused component/service/test lint, and
whitespace checks passed. Browser tests mock identity and APIs; live Firebase or
PostgreSQL services were not mutated. Full browser refresh intentionally starts a
cold in-memory cache, and first entry before prefetch completes can show local
team/invitation loading.

## Existing API key dialog restored (2026-11-03)

Restored `EnterpriseApiKeyDialog.jsx` and `apiKeyService.js` exactly from commit
`7635dc1` (the follow-up to `a4a054e`, api-key-ui), rather than replacing the existing
dialog. The dialog source blob matches the historical version. The shared
Administration header renders it for OWNER or SYSTEM_ADMIN, matching the existing
Spring read authorization. The endpoint keeps its original environment override.

The focused browser run passed **9 tests, 0 failures, 0 skips**: existing dialog
open/copy/close/fresh reopening, role visibility, HTTP 403/404 retry, rejecting a
mismatched account, Administration prefetch, and an existing team invitation action.
Tests use mocked identity/APIs and a test-only clipboard. Focused lint and whitespace
checks passed. No live key was retrieved or created.

```sh
node node_modules/@playwright/test/cli.js test --config /tmp/airabook-workspace-playwright.config.mjs --grep 'API key|Administration preloads|owner searches'
```

## Verification

For the workspace-menu rollout on 2026-10-02, all **43 browser regressions** and
**8 routing unit checks** passed, along with that rollout's production build.
The changed production components also passed
undefined-variable and hook-order lint checks, and `git diff --check` found no whitespace errors.
The new menu/hook and other wired components passed strict hook-dependency checks.
`AppHeader.jsx` retains its existing unrelated `executeSearch` effect-dependency warning;
the search implementation was not changed for this UI request.

The Invitations & requests layout follow-up passed **6 focused browser checks**:
desktop navigation and refresh, mobile navigation, loading/error shell retention,
signed-out protection, Personal-only login bypass, and the standalone login chooser.
Four hub-specific cases were added to the browser suite. Changed follow-up production
files passed strict undefined-variable, hook-order, and hook-dependency lint checks.

```sh
npm run test:workspace-routing
PLAYWRIGHT_CHANNEL=chrome npm run test:workspace-selection
npm run build
```

The routing unit checks cover Personal-only bypass, System Admin separation, inactive
memberships, account-ID encoding, safe return locations, and destination-specific deep links.
The browser suite renders the production App routes, chooser, auth pages, guards, and
three shells with mocked Firebase identity and API responses. Unrelated page bodies are
stubbed. It includes the existing eight Enterprise team regressions; it does not write to
Supabase or verify real Firebase credentials.
Menu regressions cover direct switching across all three shells and between organizations,
active checkmarks, current-page preservation, revoked roles/memberships, API retry,
keyboard opening/ArrowLeft/Escape focus return, mobile viewport containment, and
successful/failed sign-out. Desktop submenu visibility is controlled so async content
resizing cannot hide an error or retry action from the pointer.

For a live check, sign in with a Personal-only user, then a user belonging to an Enterprise
workspace, then a System Admin with an Enterprise membership. Expect respectively no
chooser, two choices, and three choices. Select each destination, switch back, and refresh
an Enterprise URL to confirm the selected workspace and correct sidebar are retained.
Open the profile menu in each shell, switch directly without the chooser, and sign out.
Repeat on a narrow mobile viewport.

## Recovery onto updated main (2026-11-03)

Recovered the stashed shared-layout and TanStack Query changes onto `819f04b`
(PR #111, API-key UI) on `enterprise-workspace-refine`. Main and the refinement
branch were fast-forwarded before reapplying the original stash. Both stashes and
a separate recovery backup were retained. All five formerly untracked source files
match the backup; the two API-key files are now tracked from main. Four stash
conflicts were combined manually, keeping the shared shell/cache and main's
website/API-key behavior and regression cases.

Focused lint, routing checks, and whitespace checks passed. The combined browser
run passed 23 tests, 0 failures, 0 skips: website/mobile handling, old and current
API-key regressions, late responses, clipboard fallback, permissions, shared
Dashboard, cache reuse, and sign-out. Identity/APIs were mocked.

The shared desktop and mobile notification bell shows the latest Personal workspace Enterprise onboarding request status, alongside existing co-author invitations. The request status component is reused inside the dropdown rather than overlaid on the Dashboard. Both headers share a session-scoped TanStack Query cache; the status link opens `/v2/workspaces`.

Enterprise request notifications have a delete action on hover or keyboard focus (always visible on touch screens). Dismissed request IDs are saved per Firebase user in browser localStorage and shared by both headers through the query cache. Deletion hides the same request permanently in that browser, including after reload or status changes, without deleting the onboarding request. Other users and new request IDs are unaffected. Cross-device dismissal is not synchronized.

## Invitations & requests query cache

The workspace hub uses the shared UID-scoped workspace-access query and separate
queries for received invitations and registration requests. Requests share the
notification query so headers and the hub deduplicate reads. These queries inherit
the session defaults (60-second freshness, 15-minute retention) and forward
AbortSignal to the existing Spring read APIs. Each section handles initial loading
and retry independently; background network failures retain cached content, while
401/403/404 responses hide the affected section's cached data.

Accept/Decline uses a mutation and disables invitation actions while it is pending.
Success and 403/404/409 conflicts cancel older reads and invalidate received
invitations, workspace access, and the user's Administration caches. New workspace
registration submissions invalidate the shared registration-request query. No API
routes or backend contracts change.

Verification: `npm run build` passed. The following focused browser commands
passed (13 and 5 tests respectively, 17 distinct scenarios; 0 failed or skipped):

```bash
npx playwright test --config playwright.workspaces.config.mjs --grep 'workspace hub|Enterprise request submission|Administration shows stale|Invitations page remains protected'
npx playwright test --config playwright.workspaces.config.mjs --grep 'Enterprise request submission|notification bell|Deleting an enterprise notification'
```

Coverage includes cached revisits, deduplicated request reads, Accept/Decline,
failed reads and Retry, mutation conflicts, stale background success/network
failure/access denial, identity changes, submission with a primed empty cache,
and desktop/mobile notification status and dismissal. These tests use the
production routes with mocked identity and Spring APIs; live backend behavior
and Firebase emulator integration were not exercised for this migration.
