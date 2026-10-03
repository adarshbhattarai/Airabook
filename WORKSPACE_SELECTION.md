# Workspace selection and in-app switching

Implemented 2026-10-02. Firebase remains the authentication provider; Spring `/api/v1/me`
supplies application roles and current workspace memberships. This is a frontend change;
no database migration, Firebase claim change, or API contract change is required.

## Entry flow

- Email and Google authentication on both legacy and v2 login/signup pages load `/me`.
- Exactly one active Personal workspace, without System Admin access, enters the Personal
  dashboard directly. Valid Personal deep links retain their query and hash.
- Other users enter `/v2/chooseWorkspace`, a standalone dark selection page without a sidebar.
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
