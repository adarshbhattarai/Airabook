import { test, expect } from '@playwright/test';

const personal = { id: 'personal', type: 'PERSONAL', name: 'My Personal Workspace', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'PERSONAL_OWNER' };
const enterprise = { id: 'team-one', type: 'ENTERPRISE', name: 'Airabook Team', slug: 'team-one', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'OWNER' };

async function fixture(page, { accounts = [personal, enterprise], systemRole = 'USER', initialRoute = '/v2/personal-login', from, signedIn = false, preference } = {}) {
  const state = { accounts, systemRole, failMe: false, calls: [], crashes: [] };
  page.on('pageerror', (error) => state.crashes.push(error.message));
  await page.addInitScript(({ initialRoute, from, signedIn, preference }) => {
    window.workspaceFixture = { initialRoute, from, signedIn };
    if (preference) localStorage.setItem('airabook:selected-workspace:fixture-user', preference);
  }, { initialRoute, from, signedIn, preference });
  await page.route('**/src/context/AuthContext.jsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    const { createContext, useContext, useState } = React;
    const Context = createContext(null);
    const identity = {uid: 'fixture-user', displayName: 'Saroj', email: 'saroj@example.test', emailVerified: true};
    export const AuthProvider = ({children}) => {
      const [user, setUser] = useState(() => window.workspaceFixture?.signedIn || sessionStorage.getItem('fixture-session') ? identity : null);
      const signIn = async () => {sessionStorage.setItem('fixture-session', 'yes'); setUser(identity); return {user: identity};};
      return React.createElement(Context.Provider, {value: {user, appUser: {displayName:'Saroj'}, billing: {}, loading:false,
        login: signIn, signup: signIn, signInWithGoogle: signIn, resendVerificationEmail:async()=>{},
        logout:async()=>{if(window.workspaceFixture.failLogout) throw new Error('Sign out unavailable'); sessionStorage.removeItem('fixture-session'); setUser(null);}}}, children);
    };
    export const useAuth = () => useContext(Context);
  ` }));
  await page.route('**/src/lib/firebase.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export const auth = {currentUser: {getIdToken: async () => 'fixture-token'}};
    export const functions = {}; export const firestore = {}; export const storage = {};
  ` }));
  // Unrelated page bodies are stubs; production auth pages, chooser, route guards,
  // all three shells, Enterprise home/team, hub, and approval queue remain real.
  await page.route(/\/src\/pages\/(Home|AiraHome|Dashboard|Books|Movies|Notifications|Media|Notes|CreateBook|BabyJournalPreview|Donate|DonateSuccess|BookDetail|AlbumDetail|NoteDetail|ErrorPage|ProfileSettings)\.jsx/, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop().replace('.jsx', '');
    return route.fulfill({ contentType: 'text/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; export default () => React.createElement('h1', null, '${name} page');` });
  });
  await page.route('**/src/pages/admin/AdminDashboard.jsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; export default () => React.createElement('h1', null, 'Users and resources');` }));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    state.calls.push(path);
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/me') return state.failMe ? reply({ message: 'Workspace service unavailable' }, 503)
      : reply({ user: { id: 'owner', systemRole: state.systemRole }, accounts: state.accounts });
    if (path.endsWith('/members')) return reply([{ userId: 'owner', displayName: 'Saroj', email: 'saroj@example.test', role: 'OWNER', status: 'ACTIVE' }]);
    if (path.endsWith('/invitations')) return reply([]);
    if (path.includes('enterpriseOnboardingRequest')) return reply({ items: [], page: { number: 0, size: 20, totalItems: 0, totalPages: 0 } });
    return reply({ message: `Unhandled endpoint: ${path}` }, 500);
  });
  await page.goto('/e2e/fixtures/workspaceSelection.html');
  return state;
}

async function login(page, method = 'email') {
  if (method === 'google') await page.getByRole('button', { name: 'Continue with Google' }).click();
  else {
    await page.getByLabel('Email address').fill('saroj@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
}

test('Personal-only login skips chooser and enters Personal shell', async ({ page }) => {
  const state = await fixture(page, { accounts: [personal] });
  await login(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Personal workspace', { exact: true })).toBeVisible();
  await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('saved preference and return route cannot bypass login chooser', async ({ page }) => {
  const state = await fixture(page, { preference: enterprise.id, from: { pathname: '/dashboard' } });
  await login(page);
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Airabook Team' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Personal account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/airabook-workspace-chooser.png' });
  expect(state.crashes).toEqual([]);
});

test('System Admin gets three destinations and a separate Admin sidebar', async ({ page }) => {
  const state = await fixture(page, { systemRole: 'SYSTEM_ADMIN' });
  await login(page, 'google');
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toBeVisible();
  await expect(page.getByLabel('Available destinations').getByRole('button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Admin dashboard' }).click();
  await expect(page).toHaveURL(/\/admin\/enterprise-approvals$/);
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Platform administration' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Personal workspace', { exact: true })).toBeVisible();
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Enterprise requests', exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('Personal-only System Admin still chooses Personal or Admin', async ({ page }) => {
  await fixture(page, { accounts: [personal], systemRole: 'SYSTEM_ADMIN' });
  await login(page);
  await expect(page.getByLabel('Available destinations').getByRole('button')).toHaveCount(2);
});

test('Enterprise choice opens its own shell and survives refresh', async ({ page }) => {
  const second = { ...enterprise, id: 'team-two', name: 'Second Team', slug: 'team-two' };
  const state = await fixture(page, { accounts: [personal, enterprise, second] });
  await login(page);
  await page.getByRole('button', { name: 'Second Team', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/enterprise-home\?accountId=team-two$/);
  await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Airabook Enterprise' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toHaveCount(0);
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  expect(state.calls).toContain('/api/v1/enterprise/accounts/team-two/members');
  expect(state.crashes).toEqual([]);
});

test('inactive workspaces and Enterprise ADMIN do not create platform Admin choice', async ({ page }) => {
  await fixture(page, { accounts: [personal, { ...enterprise, role: 'ADMIN' }, { ...enterprise, id: 'suspended', name: 'Suspended Team', membershipStatus: 'SUSPENDED' }, { ...enterprise, id: 'inactive', name: 'Inactive Team', accountStatus: 'SUSPENDED' }] });
  await login(page);
  await expect(page.getByLabel('Available destinations').getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Suspended Team' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toHaveCount(0);
});

test('revoked membership during selection cannot open a stale workspace', async ({ page }) => {
  const state = await fixture(page);
  await login(page);
  await expect(page.getByRole('button', { name: 'Airabook Team' })).toBeVisible();
  state.accounts = [personal];
  await page.getByRole('button', { name: 'Airabook Team' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByRole('button', { name: 'Airabook Team' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('removed System Admin role is revalidated before entry', async ({ page }) => {
  const state = await fixture(page, { systemRole: 'SYSTEM_ADMIN' });
  await login(page);
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toBeVisible();
  state.systemRole = 'USER';
  await page.getByRole('button', { name: 'Admin dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText('System Admin access is no longer available');
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toHaveCount(0);
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
});

test('backend failure stays on chooser and supports retry instead of guessing a workspace', async ({ page }) => {
  const state = await fixture(page);
  state.failMe = true;
  await login(page);
  await expect(page.getByRole('alert')).toContainText('Workspace service unavailable');
  await expect(page).toHaveURL(/\/v2\/chooseWorkspace$/);
  state.failMe = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Airabook Team' })).toBeVisible();
});

test('unauthorized explicit Enterprise link returns to chooser, not another workspace', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=removed-team', preference: enterprise.id });
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  expect(state.calls.filter((path) => path.endsWith('/members'))).toEqual([]);
});

test('Personal deep-link return preserves query and hash after selection', async ({ page }) => {
  await fixture(page, { from: { pathname: '/books', search: '?sort=recent', hash: '#saved' } });
  await login(page);
  await page.getByRole('button', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/books\?sort=recent#saved$/);
});

test('chooser supports keyboard selection and mobile Admin navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/v2/chooseWorkspace' });
  const admin = page.getByRole('button', { name: 'Admin dashboard' });
  await expect(admin).toBeVisible();
  await admin.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Open admin navigation' }).click();
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
});

for (const initialRoute of ['/login', '/signup', '/v2/personal-signup']) {
  test(`${initialRoute} Google authentication uses the same workspace chooser`, async ({ page }) => {
    await fixture(page, { initialRoute });
    await page.getByRole('button', { name: /Google/ }).click();
    await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  });
}

test('legacy email login uses the workspace chooser', async ({ page }) => {
  await fixture(page, { initialRoute: '/login' });
  await page.getByPlaceholder('Email address', { exact: true }).fill('saroj@example.test');
  await page.getByPlaceholder('Password', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
});

test('direct platform Admin link cannot render Admin shell for an Enterprise ADMIN', async ({ page }) => {
  await fixture(page, { signedIn: true, accounts: [personal, { ...enterprise, role: 'ADMIN' }], initialRoute: '/admin/enterprise-approvals' });
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Admin dashboard' })).toHaveCount(0);
});

test('signed-out chooser redirects to login', async ({ page }) => {
  const state = await fixture(page, { initialRoute: '/v2/chooseWorkspace' });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(state.calls).toEqual([]);
});

test('no active memberships shows an honest empty state, not a Personal destination', async ({ page }) => {
  await fixture(page, { accounts: [], signedIn: true, initialRoute: '/v2/chooseWorkspace' });
  await expect(page.getByText('No active workspaces are available.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Personal account' })).toHaveCount(0);
});

test('Invitations page preserves the desktop sidebar and top navigation through refresh', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  await page.getByRole('link', { name: 'Invitations & requests', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/workspaces$/);
  await expect(page.getByRole('heading', { name: 'Your Airabook workspaces' })).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invitations & requests', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByPlaceholder('Search books, chapters, pages...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Invitations for you' })).toBeVisible();
  await page.screenshot({ path: '/tmp/airabook-invitations-with-layout.png' });
  await page.reload();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByPlaceholder('Search books, chapters, pages...')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Airabook workspaces' })).toBeVisible();
  await page.getByRole('link', { name: '← Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.locator('aside')).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Invitations page keeps the mobile top bar and accessible navigation drawer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  await page.getByRole('button', { name: 'Open personal navigation' }).click();
  await page.getByRole('link', { name: 'Invitations & requests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your Airabook workspaces' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open personal navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  await page.getByRole('button', { name: 'Open personal navigation' }).click();
  await expect(page.getByRole('link', { name: 'Invitations & requests', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Invitations & requests', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(state.crashes).toEqual([]);
});

test('Invitations page retains its shell while loading and when the API fails', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/v1/me', async (route) => {
    await pending;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Workspace service unavailable' }) });
  });
  await page.getByRole('link', { name: 'Invitations & requests', exact: true }).click();
  await expect(page.getByText('Loading workspace access…', { exact: true })).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByPlaceholder('Search books, chapters, pages...')).toBeVisible();
  release();
  await expect(page.getByRole('alert')).toContainText('Workspace service unavailable');
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Invitations page remains protected when signed out', async ({ page }) => {
  const state = await fixture(page, { initialRoute: '/v2/workspaces' });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
  expect(state.calls).toEqual([]);
});

async function openProfileWorkspaces(page) {
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await expect(page.getByText('saroj@example.test', { exact: true }).first()).toBeVisible();
  await page.getByRole('menuitem', { name: /Switch workspace/ }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Personal account' })).toBeVisible();
}

test('profile menu switches directly across Personal, Enterprise, and System Admin shells', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/dashboard' });
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio')).toHaveCount(3);
  await expect(page.getByRole('menuitemradio', { name: 'Personal account' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page).toHaveURL(/enterprise-home\?accountId=team-one$/);
  await expect(page.getByText('Airabook Team · Manage your team and account access.')).toBeVisible();
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('menuitemradio', { name: 'Personal account' })).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({ path: '/tmp/airabook-enterprise-profile-switcher.png' });
  await page.getByRole('menuitemradio', { name: 'Admin dashboard' }).click();
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Admin dashboard' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('Enterprise workspace pill switches organizations and persists the exact account', async ({ page }) => {
  const second = { ...enterprise, id: 'team-two', name: 'Second Team', slug: 'team-two' };
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', accounts: [personal, enterprise, second] });
  await expect(page.getByText('Airabook Team · Manage your team and account access.')).toBeVisible();
  await page.locator('header').getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Second Team' }).click();
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  await expect(page).toHaveURL(/accountId=team-two$/);
  expect(await page.evaluate(() => localStorage.getItem('airabook:selected-workspace:fixture-user'))).toBe('team-two');
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Second Team' })).toHaveAttribute('aria-checked', 'true');
  expect(state.calls).toContain('/api/v1/enterprise/accounts/team-two/members');
  expect(state.crashes).toEqual([]);
});

test('Enterprise ADMIN profile hides platform Admin and inactive memberships', async ({ page }) => {
  await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', accounts: [personal, { ...enterprise, role: 'ADMIN' }, { ...enterprise, id: 'suspended', name: 'Suspended Team', membershipStatus: 'SUSPENDED' }] });
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await expect(page.getByRole('menuitemradio', { name: 'Admin dashboard' })).toHaveCount(0);
  await expect(page.getByRole('menuitemradio', { name: 'Suspended Team' })).toHaveCount(0);
});

test('profile switching handles an API outage with in-menu retry', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  await openProfileWorkspaces(page);
  state.failMe = true;
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page.getByRole('alert')).toContainText('Workspace service unavailable');
  await expect(page).toHaveURL(/\/dashboard$/);
  state.failMe = false;
  await page.getByRole('menuitem', { name: 'Try again' }).click();
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page).toHaveURL(/accountId=team-one$/);
  await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
});

test('revoked workspace access stays in the profile menu without redirecting', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  await openProfileWorkspaces(page);
  state.accounts = [personal];
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer available');
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('profile selection revalidates a removed System Admin role', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/dashboard' });
  await openProfileWorkspaces(page);
  state.systemRole = 'USER';
  await page.getByRole('menuitemradio', { name: 'Admin dashboard' }).click();
  await expect(page.getByRole('alert')).toContainText('System Admin access is no longer available');
  await expect(page.getByRole('menuitemradio', { name: 'Admin dashboard' })).toHaveCount(0);
  await expect(page.getByTestId('admin-shell')).toHaveCount(0);
});

test('selecting the current workspace preserves the Personal deep link', async ({ page }) => {
  await fixture(page, { signedIn: true, initialRoute: '/books?sort=recent#saved' });
  await openProfileWorkspaces(page);
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/books\?sort=recent#saved$/);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('desktop profile submenu supports keyboard entry, selection, and Escape focus return', async ({ page }) => {
  await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  const trigger = page.getByRole('button', { name: 'Open profile menu' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const submenu = page.getByRole('menuitem', { name: /Switch workspace/ });
  await expect(submenu).toBeVisible();
  await submenu.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  await expect(submenu).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toBeVisible();
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/accountId=team-one$/);
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeFocused();
});

test('an errored profile submenu still dismisses with Escape and can reopen', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard' });
  await openProfileWorkspaces(page);
  state.failMe = true;
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page.getByRole('alert')).toContainText('Workspace service unavailable');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open profile menu' })).toBeFocused();
  state.failMe = false;
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toBeVisible();
});

test('failed profile sign-out retains the session and supports retry', async ({ page }) => {
  await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin/enterprise-approvals' });
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.evaluate(() => { window.workspaceFixture.failLogout = true; });
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sign out unavailable');
  await expect(page.getByTestId('admin-shell')).toBeVisible();
  await page.evaluate(() => { window.workspaceFixture.failLogout = false; });
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/personal-login$/);
});

for (const [mode, initialRoute] of [['Personal', '/dashboard'], ['Enterprise', '/v2/enterprise-home?accountId=team-one'], ['Admin', '/admin/enterprise-approvals']]) {
  test(`${mode} profile menu signs out and removes authenticated content`, async ({ page }) => {
    await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute });
    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/v2\/personal-login$/);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open profile menu' })).toHaveCount(0);
  });

  test(`${mode} mobile profile expands workspace choices within the viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute });
    await openProfileWorkspaces(page);
    await expect(page.getByRole('menu')).toHaveCount(1);
    const menuBox = await page.getByRole('menu').boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `/tmp/airabook-${mode.toLowerCase()}-mobile-profile.png` });
    await page.getByRole('menuitemradio', { name: mode === 'Personal' ? 'Airabook Team' : 'Personal account' }).click();
    await expect(page).toHaveURL(mode === 'Personal' ? /accountId=team-one$/ : /\/dashboard$/);
    await expect(page.getByTestId('workspace-chooser')).toHaveCount(0);
    expect(state.crashes).toEqual([]);
  });
}
