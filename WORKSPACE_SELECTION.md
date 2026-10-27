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
  adds an **Admin dashboard** row. Enterprise `OWNER` or `ADMIN` does not grant this row.
- A saved workspace preference does not bypass the chooser on a new sign-in.
- Missing access or backend errors do not silently open a Personal dashboard. The chooser
  provides an empty/error state, retry, invitations/requests access, and sign-out.

## Destinations and shells

| Choice | Destination | Layout |
| --- | --- | --- |
| Personal account | `/dashboard` or matching Personal deep link | Existing `AppShell` and Personal sidebar |
| Enterprise workspace | `/v2/enterprise-home?accountId={id}` | Existing Enterprise sidebar/header and account-scoped data |
| Admin dashboard | `/admin/enterprise-approvals` or matching Admin deep link | Dedicated `AdminShell` and platform navigation |

The platform Admin shell includes onboarding review and the existing Users & resources
page at `/admin`. Personal navigation no longer includes platform administration links.
Personal and Admin render the same `Sidebar` component, with destination-specific
links and identity subtitles. They share the Airabook logo, section heading/row
spacing, active left-edge indicator, footer controls, saved desktop collapse state,
and mobile drawer at the same breakpoint. Admin content scrolls separately from
its sidebar/header, like Personal content. Personal credit usage remains in the
Personal sidebar.
All shells offer **Switch workspace** as an in-place dropdown, not a redirect to the
login chooser. Their profile menus show the user's name/email, workspace choices, and
**Sign out**. Personal retains **Profile Settings**. Desktop profile menus use a nested
workspace submenu; narrow mobile screens expand the choices inside the same popover.
The active destination has a checkmark, including the separate platform Admin context.
Choosing another workspace navigates directly to its own shell. Choosing the current
destination closes the menu without resetting the current page/query/hash.
The `/v2/workspaces` invitation/request hub renders inside the Personal `AppShell`,
preserving its sidebar, desktop/mobile top navigation, profile menu, and theme.
This also applies to direct navigation, refresh, loading, and API error states. Its
back link returns to `/dashboard` without dropping the shell. The standalone
post-login chooser remains `/v2/chooseWorkspace`.

Enterprise workspaces share the Enterprise layout, but each URL identifies its own
account. Refresh validates that ID against current `/me` memberships. An inaccessible
explicit ID returns to the chooser instead of falling back to another Enterprise account.
Old URLs without an ID retain compatibility with a valid saved preference or sole
accessible Enterprise workspace.

The Enterprise overview displays the selected account's `website` from `/api/v1/me`
beneath the organization name. Valid HTTP/HTTPS websites open in a new tab; missing
or invalid values omit the website row. The link updates when the workspace changes
and wraps on narrow screens. This uses the Enterprise profile fields returned by
the backend without an additional account-details request.

Workspace owners and users with platform `SYSTEM_ADMIN` access see **Get API key**
on the Enterprise overview. It opens a compact dialog that reads the existing key
through authenticated `GET /api/v1/apiKey?accountId={accountId}`. The response keeps
its `{ status: true, data: ... }` wrapper; `apiKeyService.js` validates and unwraps
it, including that the returned account ID matches the selected workspace. The
endpoint can be overridden with `VITE_SPRING_ENTERPRISE_API_KEY_ENDPOINT`.

The key is fetched on each open, displayed in a selectable read-only field, and
copied only when the user clicks **Copy key**. Loading, missing-key, permission,
retry, and clipboard-denial states remain in the dialog. Closing it or changing
workspaces clears the displayed key and ignores late responses. Keys are not
stored in browser preferences. This UI only retrieves the existing key; automatic
generation on approval remains owned by the backend. Workspace admins and members
do not get the button unless they also have platform System Admin access.

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
