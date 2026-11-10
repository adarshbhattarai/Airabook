import { test, expect } from '@playwright/test';

const personal = { id: 'personal', type: 'PERSONAL', name: 'My Personal Workspace', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'PERSONAL_OWNER' };
const enterprise = { id: 'team-one', type: 'ENTERPRISE', name: 'Airabook Team', slug: 'team-one', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'OWNER' };

async function fixture(page, { accounts = [personal, enterprise], systemRole = 'USER', initialRoute = '/v2/personal-login', from, signedIn = false, preference, theme, realDashboard = false, withBooks = false, realAdminUsers = false, users = [], usersStatus = 200, usersBody, failMe = false, meGate, onboardingRequests = [], receivedInvitations = [], receivedStatus = 200, notificationPreview } = {}) {
  const state = { receivedInvitations, receivedStatus, onboardingRequests, accounts, systemRole, failMe, meGate, membersByAccount: {}, invitationsByAccount: {}, invitationRequests: [], calls: [], crashes: [], users, usersStatus, usersBody, userAuthorization: [], apiKeyRequests: [] };
  page.on('pageerror', (error) => state.crashes.push(error.message));
  await page.addInitScript(({ initialRoute, from, signedIn, preference, theme, withBooks }) => {
    window.workspaceFixture = { initialRoute, from, signedIn, withBooks };
    if (preference) localStorage.setItem('airabook:selected-workspace:fixture-user', preference);
    if (theme) localStorage.setItem('airabook-theme', theme);
  }, { initialRoute, from, signedIn, preference, theme, withBooks });
  await page.route('**/src/context/AuthContext.jsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    const { createContext, useContext, useState, useEffect } = React;
    const Context = createContext(null);
    const identity = {uid: 'fixture-user', displayName: 'Saroj', email: 'saroj@example.test', emailVerified: true};
    export const AuthProvider = ({children}) => {
      const [user, setUser] = useState(() => window.workspaceFixture?.signedIn || sessionStorage.getItem('fixture-session') ? identity : null);
      useEffect(() => { window.fixtureSwitchUser = (uid) => setUser({...identity, uid}); return () => { delete window.fixtureSwitchUser; }; }, []);
      const signIn = async () => {sessionStorage.setItem('fixture-session', 'yes'); setUser(identity); return {user: identity};};
      return React.createElement(Context.Provider, {value: {user, appUser: {displayName:'Saroj', accessibleBookIds: window.workspaceFixture?.withBooks ? [{bookId: 'fixture-book', title: 'Fixture Book'}] : []}, billing: {}, loading:false,
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
    if (realDashboard && name === 'Dashboard') return route.continue();
    return route.fulfill({ contentType: 'text/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; export default () => React.createElement('h1', null, '${name} page');` });
  });
  if (!realAdminUsers) await page.route('**/src/pages/admin/AdminDashboard.jsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; export default () => React.createElement('h1', null, 'Users and resources');` }));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    state.calls.push(path);
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/v1/apiKey') {
      state.apiKeyRequests = [...(state.apiKeyRequests || []), { accountId: new URL(route.request().url()).searchParams.get('accountId'), authorization: route.request().headers().authorization, method: route.request().method() }];
      return reply(state.apiKeyBody || { status: true, data: { accountId: new URL(route.request().url()).searchParams.get('accountId'), apiKey: `fixture-key-${new URL(route.request().url()).searchParams.get('accountId')}`, defaultDomain: 'https://example.test' } }, state.apiKeyStatus || 200);
    }
    if (path === '/api/v1/users') {
      state.userAuthorization.push(route.request().headers().authorization);
      return reply(state.usersBody ?? { status: true, data: state.users }, state.usersStatus);
    }
    if (path === '/api/v1/me') {
      await state.meGate;
      return state.failMe ? reply({ message: 'Workspace service unavailable' }, 503)
        : reply({ user: { id: 'owner', systemRole: state.systemRole }, accounts: state.accounts });
    }
    if (path === '/api/v1/enterpriseOnboardingRequest' && route.request().method() === 'POST') {
      state.submittedRequest = route.request().postDataJSON();
      const submitted = { ...state.submittedRequest, id: 'submitted-request', status: 'SUBMITTED' };
      state.onboardingRequests = [submitted, ...state.onboardingRequests];
      return reply(submitted, 201);
    }
    if (path.endsWith('/members')) {
      await state.memberGate;
      if (state.memberStatus && state.memberStatus !== 200) return reply({ message: 'Team data unavailable' }, state.memberStatus);
      return reply(state.membersByAccount[path.split('/')[5]] || [{ userId: 'owner', displayName: 'Saroj', email: 'saroj@example.test', role: 'OWNER', status: 'ACTIVE' }]);
    }
    if (path === '/api/v1/enterprise/invitations') {
      await state.receivedGate;
      return state.receivedStatus === 200 ? reply(state.receivedInvitations)
        : reply({ message: 'Unable to load received invitations' }, state.receivedStatus);
    }
    if (/\/enterprise\/invitations\/[^/]+\/(accept|decline)$/.test(path)) {
      await state.responseGate;
      if (state.responseStatus) return reply({ message: 'Invitation could not be updated' }, state.responseStatus);
      state.receivedInvitations = state.receivedInvitations.filter((item) => item.invitationId !== path.split('/').at(-2));
      if (path.endsWith('/accept')) state.accounts = [...state.accounts, enterprise];
      return reply({});
    }
    if (path.endsWith('/invitations')) {
      const status = new URL(route.request().url()).searchParams.get('status');
      state.invitationRequests.push({ accountId: path.split('/')[5], status });
      return reply((state.invitationsByAccount[path.split('/')[5]] || []).filter((item) => item.status === status));
    }
    if (path.includes('enterpriseOnboardingRequest')) return reply({ items: state.onboardingRequests, page: { number: 0, size: 20, totalItems: 0, totalPages: 0 } });
    return reply({ message: `Unhandled endpoint: ${path}` }, 500);
  });
  if (notificationPreview) await page.route('**/src/services/collabApi.js*', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `export const collabApi = {listNotifications: async () => (${JSON.stringify(notificationPreview)})}; export const getCallableErrorMessage = () => 'Notification error';`,
  }));
  await page.goto('/e2e/fixtures/workspaceSelection.html');
  return state;
}

async function login(page, method = 'email') {
  if (method === 'google') await page.getByRole('button', { name: 'Sign in with Google' }).click();
  else {
    await page.getByLabel('Email address').fill('saroj@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
}

test('application user directory uses backend role and bearer token without Firebase admin claims', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin', realAdminUsers: true,
    users: [
      { id: 'postgres-admin', firebaseUid: 'admin-firebase', displayName: 'Synced Admin', email: 'admin@example.test', systemRole: 'SYSTEM_ADMIN', status: 'ACTIVE', emailVerified: true },
      { id: 'postgres-user', firstName: 'Legacy', lastName: 'User', email: 'legacy@example.test', systemRole: 'USER', status: 'INACTIVE', emailVerified: false },
    ],
  });
  await expect(page.getByRole('heading', { name: 'Application users' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Synced Admin/ })).toContainText('System Admin');
  await expect(page.getByRole('row', { name: /Synced Admin/ })).toContainText('Verified');
  await expect(page.getByRole('row', { name: /Legacy User/ })).toContainText('INACTIVE');
  await expect(page.getByRole('row', { name: /Legacy User/ })).toContainText('Not verified');
  await expect(page.getByRole('columnheader', { name: 'Plan', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sync Storage' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Platform administration' })).toBeVisible();
  expect(state.userAuthorization).toEqual(['Bearer fixture-token']);
  state.users = [{ id: 'postgres-new', email: 'new@example.test', systemRole: 'USER', status: 'ACTIVE', emailVerified: false }];
  await page.getByRole('button', { name: 'Refresh List' }).click();
  await expect(page.getByRole('row', { name: /new@example.test/ })).toBeVisible();
  await expect(page.getByText('Synced Admin', { exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
  await page.screenshot({ path: '/tmp/airabook-postgres-users.png' });
});

for (const [status, message] of [[403, 'Your account does not have permission'], [401, 'Your session has expired'], [503, 'Unable to load users']]) {
  test(`application user directory handles HTTP ${status} and retry without false empty state`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin', realAdminUsers: true, usersStatus: status });
    await expect(page.locator('table').getByRole('alert')).toContainText(message);
    await expect(page.getByText('No users found.', { exact: true })).toHaveCount(0);
    state.usersStatus = 200;
    state.users = [{ id: 'recovered', displayName: 'Recovered User', systemRole: 'USER', status: 'ACTIVE', emailVerified: true }];
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByText('Recovered User', { exact: true })).toBeVisible();
    expect(state.crashes).toEqual([]);
  });
}

for (const usersBody of [{ status: false, message: 'Unavailable' }, { status: true, data: null }]) {
  test(`application user directory rejects invalid wrapper ${JSON.stringify(usersBody)}`, async ({ page }) => {
    await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin', realAdminUsers: true, usersBody });
    await expect(page.locator('table').getByRole('alert')).toContainText('Unable to load users');
    await expect(page.getByText('No users found.', { exact: true })).toHaveCount(0);
  });
}

test('application user directory distinguishes genuine empty database', async ({ page }) => {
  await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin', realAdminUsers: true });
  await expect(page.getByText('No users found.', { exact: true })).toBeVisible();
  await expect(page.locator('table').getByRole('alert')).toHaveCount(0);
});

test('application user directory is not requested by an Enterprise ADMIN', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, accounts: [personal, { ...enterprise, role: 'ADMIN' }], initialRoute: '/admin', realAdminUsers: true });
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  expect(state.calls).not.toContain('/api/v1/users');
});

test('general login entry has no Enterprise selector and preserves the return route', async ({ page }) => {
  const state = await fixture(page, { initialRoute: '/v2/login', accounts: [personal], from: { pathname: '/books', search: '?sort=recent' } });
  await expect(page.getByRole('heading', { name: 'Welcome Back', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Signup', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await expect(page.getByText('Plans & Credits', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText(/Enterprise/)).toHaveCount(0);
  await expect(page.getByText('Account selection', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: '/tmp/airabook-restored-login.png' });
  await login(page);
  await expect(page).toHaveURL(/\/books\?sort=recent$/);
  expect(state.crashes).toEqual([]);
});

test('signup uses the common account flow and preserves the return route when switching to login', async ({ page }) => {
  await fixture(page, { initialRoute: '/v2/personal-signup', accounts: [personal], from: { pathname: '/books', hash: '#saved' } });
  await expect(page.getByRole('heading', { name: 'Join the Family' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Account', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign up with Google' })).toBeVisible();
  await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
  await page.screenshot({ path: '/tmp/airabook-restored-signup.png' });
  await expect(page.getByText(/Enterprise/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await login(page);
  await expect(page).toHaveURL(/\/books#saved$/);
});

for (const initialRoute of ['/signup', '/v2/personal-signup']) {
  test(`${initialRoute} restored signup submits through the common workspace flow`, async ({ page }) => {
    const state = await fixture(page, { initialRoute });
    await page.getByLabel('Your name', { exact: true }).fill('Saroj');
    await page.getByLabel('Email address').fill('saroj@example.test');
    await page.getByLabel('Password', { exact: true }).fill('test-only-password');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
    expect(state.crashes).toEqual([]);
  });
}

test('restored public header preserves the return route across signup and login', async ({ page }) => {
  await fixture(page, { accounts: [personal], from: { pathname: '/books', search: '?sort=recent' } });
  await page.getByRole('navigation').getByRole('link', { name: 'Signup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join the Family' })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Login', exact: true }).click();
  await login(page);
  await expect(page).toHaveURL(/\/books\?sort=recent$/);
});

test('restored auth cards fit mobile and the public menu links remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { accounts: [personal], from: { pathname: '/books', hash: '#saved' } });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/airabook-restored-login-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Signup', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Join the Family' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/airabook-restored-signup-mobile.png', fullPage: true });
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await login(page);
  await expect(page).toHaveURL(/\/books#saved$/);
  expect(state.crashes).toEqual([]);
});

test('Enterprise request submission uses only canonical request APIs and does not create a workspace', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces' });
  // Prime an empty request cache before submitting, then verify it is refreshed.
  await expect(page.getByText('You have not submitted an Enterprise registration request.')).toBeVisible();
  await page.getByRole('link', { name: 'Request workspace', exact: true }).click();
  await expect(page.getByLabel('Enterprise name', { exact: true })).toHaveCSS('border-radius', '6px');
  await expect(page.getByRole('button', { name: 'Submit for System Administrator approval' })).toHaveCSS('border-radius', '4px');
  await page.getByLabel('Enterprise name', { exact: true }).fill('Example Business');
  await page.getByLabel('Requested workspace URL', { exact: true }).fill('example-business');
  await page.getByLabel('Enterprise website', { exact: true }).fill('https://example.test');
  await page.getByLabel('Country', { exact: true }).selectOption('Nepal');
  await page.getByLabel('Contact person', { exact: true }).fill('Test Contact');
  await page.getByLabel('Phone number', { exact: true }).fill('+9779800000000');
  await page.getByLabel('Contact email', { exact: true }).fill('contact@example.test');
  await page.getByLabel('How will your organization use Airabook?', { exact: true })
    .fill('We plan to collaborate on educational storybooks.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit for System Administrator approval' }).click();
  await expect(page.getByRole('heading', { name: 'Your Enterprise request was submitted' })).toBeVisible();
  expect(state.submittedRequest).toMatchObject({ proposedAccountName: 'Example Business', requestedSlug: 'example-business' });
  expect(state.submittedRequest).not.toHaveProperty('status');
  expect(state.calls).toContain('/api/v1/enterpriseOnboardingRequest');
  expect(state.calls).toContain('/api/v1/enterpriseOnboardingRequest/mine');
  expect(state.calls).not.toContain('/api/v1/enterprise/accounts');
  expect(state.calls).not.toContain('/api/v1/enterprise/requests/mine');
  expect(state.accounts).toEqual([personal]);
  await page.getByRole('button', { name: 'Open workspace hub' }).click();
  await expect(page.locator('article').getByText('Example Business', { exact: true })).toBeVisible();
  await expect(page.getByText('You have not submitted an Enterprise registration request.')).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('obsolete Enterprise login URL opens general login and uses the workspace chooser', async ({ page }) => {
  const state = await fixture(page, { initialRoute: '/v2/enterprise-login' });
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByLabel('Workspace URL', { exact: true })).toHaveCount(0);
  await login(page);
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  expect(state.calls).not.toContain('/api/v1/enterprise/auth/login');
  expect(state.crashes).toEqual([]);
});

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

test('workspace chooser stays white while preserving a saved dark application theme', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, theme: 'dark', initialRoute: '/v2/chooseWorkspace' });
  await expect(page.getByRole('button', { name: 'Airabook Team', exact: true })).toBeVisible();
  await expect(page.getByTestId('workspace-chooser')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => localStorage.getItem('airabook-theme'))).toBe('dark');
  await page.getByRole('button', { name: 'Airabook Team', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/enterprise-home\?accountId=team-one$/);
  await expect(page.locator('html')).toHaveClass(/theme-dark/);
  expect(await page.evaluate(() => localStorage.getItem('airabook-theme'))).toBe('dark');
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

test('Admin sidebar collapse persists through refresh and workspace switching', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin' });
  const navigation = page.getByRole('navigation', { name: 'Platform administration' });
  await expect(navigation.getByRole('link', { name: 'Users & resources', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Airabook Admin home' }).getByAltText('Airabook logo')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await navigation.getByRole('link', { name: 'Enterprise requests', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/enterprise-approvals$/);
  await expect(navigation.getByRole('link', { name: 'Enterprise requests', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('link', { name: 'Users & resources', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Personal account', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('button', { name: 'Expand sidebar', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Enterprise requests', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(page.getByText('Personal workspace', { exact: true })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Admin mobile drawer closes after navigation and can be reopened and dismissed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', initialRoute: '/admin' });
  const navigation = page.getByRole('navigation', { name: 'Platform administration' });
  await expect(navigation).toHaveCount(0);
  await page.getByRole('button', { name: 'Open admin navigation' }).click();
  await expect(navigation).toBeVisible();
  await navigation.getByRole('link', { name: 'Enterprise requests', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/enterprise-approvals$/);
  await expect(navigation).toHaveCount(0);
  await page.getByRole('button', { name: 'Open admin navigation' }).click();
  await expect(navigation).toBeVisible();
  await page.getByRole('button', { name: 'Close admin navigation' }).click({ position: { x: 380, y: 400 } });
  await expect(navigation).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

for (const [path, heading] of [['/dashboard', 'Dashboard page'], ['/books', 'Books page'], ['/media', 'Media page']]) {
  test(`Personal ${path} loads and refreshes without a workspace-access gate`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, initialRoute: path, preference: personal.id, failMe: true });
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
    expect(state.calls).not.toContain('/api/v1/me');
    await page.reload();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
    expect(state.calls).not.toContain('/api/v1/me');
    expect(state.crashes).toEqual([]);
  });
}

test('switching from Enterprise to Personal does not repeat access validation after selection', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one' });
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await openProfileWorkspaces(page);
  let selectionRequests = 0;
  await page.route('**/api/v1/me', (route) => {
    selectionRequests += 1;
    return route.fulfill({
      status: selectionRequests === 1 ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(selectionRequests === 1
        ? { user: { id: 'owner', systemRole: 'USER' }, accounts: [personal, enterprise] }
        : { message: 'Workspace service unavailable' }),
    });
  });
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Personal navigation' })).toBeVisible();
  await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
  expect(selectionRequests).toBe(1);
  expect(state.crashes).toEqual([]);
});

test('Enterprise website remains visible and wraps on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const website = `https://enterprise.example.test/${'organization-details/'.repeat(6)}`;
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one',
    accounts: [personal, { ...enterprise, website }] });
  const link = page.getByRole('link', { name: website, exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', website);
  const bounds = await link.boundingBox();
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.height).toBeGreaterThan(20);
  await page.screenshot({ path: '/tmp/airabook-enterprise-website-mobile.png' });
  expect(state.crashes).toEqual([]);
});

for (const website of [null, 'javascript:alert(1)']) {
  test(`Enterprise overview handles an unavailable website (${website})`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one',
      accounts: [personal, { ...enterprise, website }] });
    await expect(page.getByText('Airabook Team · Manage your team and account access.')).toBeVisible();
    await expect(page.getByText('Website:', { exact: true })).toHaveCount(0);
    expect(state.crashes).toEqual([]);
  });
}

test('Enterprise owner can view and copy the API key in a compact dialog', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async (value) => { window.copiedApiKey = value; } },
  }));
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  const trigger = page.getByRole('button', { name: 'Get API key', exact: true });
  await expect(trigger).toBeVisible();
  expect(state.apiKeyRequests).toEqual([]);
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Workspace API key' });
  await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('fixture-key-team-one');
  await expect(dialog.getByText('Website', { exact: true })).toBeVisible();
  await expect(dialog.getByText('https://example.test', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy key', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('API key copied to clipboard.');
  expect(await page.evaluate(() => window.copiedApiKey)).toBe('fixture-key-team-one');
  expect(state.apiKeyRequests).toEqual([{ accountId: 'team-one', method: 'GET', authorization: 'Bearer fixture-token' }]);
  const desktopBounds = await dialog.boundingBox();
  expect(desktopBounds.width).toBeLessThanOrEqual(448);
  await page.screenshot({ path: '/tmp/airabook-enterprise-api-key-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await dialog.boundingBox();
  expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '/tmp/airabook-enterprise-api-key-mobile.png' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('fixture-key-team-one');
  await expect(dialog.getByRole('status')).toHaveCount(0);
  expect(state.apiKeyRequests).toHaveLength(2);
  expect(state.apiKeyRequests.every((request) => request.method === 'GET')).toBe(true);
  expect(state.crashes).toEqual([]);
});

test('Enterprise API key ignores a late response after switching workspaces', async ({ page }) => {
  const second = { ...enterprise, id: 'team-two', name: 'Second Team', slug: 'team-two' };
  const state = await fixture(page, { signedIn: true, accounts: [personal, enterprise, second], initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  let firstRequest;
  await page.route((url) => url.pathname === '/api/v1/apiKey' && url.searchParams.get('accountId') === 'team-one',
    (route) => { firstRequest = route; });
  await page.getByRole('button', { name: 'Get API key', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Loading API key');
  await expect.poll(() => Boolean(firstRequest)).toBe(true);
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Second Team', exact: true }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  await page.getByRole('button', { name: 'Get API key', exact: true }).click();
  const field = page.getByRole('dialog').getByLabel('API key', { exact: true });
  await expect(field).toHaveValue('fixture-key-team-two');
  await firstRequest.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: true, data: { accountId: 'team-one', apiKey: 'old-workspace-key' } }) });
  await expect(field).toHaveValue('fixture-key-team-two');
  await expect(page.getByRole('dialog')).toContainText('Second Team');
  expect(state.crashes).toEqual([]);
});

for (const [status, message] of [[404, 'No API key is available'], [403, 'do not have permission'], [503, 'Service unavailable']]) {
  test(`Enterprise API key handles HTTP ${status} and retries`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
    state.apiKeyStatus = status;
    state.apiKeyBody = { message: 'Service unavailable' };
    await page.getByRole('button', { name: 'Get API key', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('alert')).toContainText(message);
    await expect(dialog.getByLabel('API key', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Copy key' })).toHaveCount(0);
    state.apiKeyStatus = 200;
    state.apiKeyBody = undefined;
    await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('fixture-key-team-one');
    expect(state.apiKeyRequests).toHaveLength(2);
    expect(state.crashes).toEqual([]);
  });
}

test('Enterprise API key offers manual copying when clipboard access fails', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true, value: { writeText: async () => { throw new Error('Clipboard denied'); } },
  }));
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await page.getByRole('button', { name: 'Get API key', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Copy key', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Select the key and copy it manually');
  await expect(dialog.getByLabel('API key', { exact: true })).toHaveValue('fixture-key-team-one');
  await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

for (const role of ['ADMIN', 'MEMBER']) {
  test(`Enterprise ${role} cannot open the API key dialog`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, accounts: [personal, { ...enterprise, role }], initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
    await expect(page.getByText('Airabook Team · Manage your team and account access.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get API key', exact: true })).toHaveCount(0);
    expect(state.apiKeyRequests).toEqual([]);
  });
}

test('System Admin can retrieve an API key from an Enterprise workspace', async ({ page }) => {
  await fixture(page, { signedIn: true, systemRole: 'SYSTEM_ADMIN', accounts: [personal, { ...enterprise, role: 'MEMBER' }], initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await page.getByRole('button', { name: 'Get API key', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('API key', { exact: true })).toHaveValue('fixture-key-team-one');
});

test('Enterprise API key rejects a response for a different account', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  state.apiKeyBody = { status: true, data: { accountId: 'other-account', apiKey: 'wrong-workspace-key' } };
  await page.getByRole('button', { name: 'Get API key', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Unable to read the API key for this workspace');
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('existing API key dialog loads on click, copies, and fetches fresh after closing', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.copiedTestKey = value; } } }));
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('button', { name: 'Get API key' })).toBeVisible();
  expect(state.apiKeyRequests || []).toHaveLength(0);
  await page.getByRole('button', { name: 'Get API key' }).click();
  const field = page.getByLabel('API key', { exact: true });
  await expect(field).toHaveValue('fixture-key-team-one');
  await page.getByRole('button', { name: 'Copy key' }).click();
  await expect(page.getByText('API key copied to clipboard.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.copiedTestKey)).toBe('fixture-key-team-one');
  expect(state.apiKeyRequests).toEqual([{ accountId: 'team-one', authorization: 'Bearer fixture-token', method: 'GET' }]);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(field).toHaveCount(0);
  state.apiKeyBody = { status: true, data: { accountId: 'team-one', apiKey: 'test-only-fresh-key' } };
  await page.getByRole('button', { name: 'Get API key' }).click();
  await expect(field).toHaveValue('test-only-fresh-key');
  expect(state.apiKeyRequests).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

for (const [role, systemRole, visible] of [['ADMIN', 'USER', false], ['MEMBER', 'USER', false], ['MEMBER', 'SYSTEM_ADMIN', true]]) {
  test(`API key visibility follows backend permissions for ${role}/${systemRole}`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, systemRole, accounts: [personal, { ...enterprise, role }], initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
    await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get API key' })).toHaveCount(visible ? 1 : 0);
    expect(state.apiKeyRequests || []).toHaveLength(0);
    expect(state.crashes).toEqual([]);
  });
}

for (const status of [403, 404]) {
  test(`API key HTTP ${status} shows an error and can retry`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
    state.apiKeyStatus = status;
    state.apiKeyBody = { message: 'Workspace owner permission is required to view API keys' };
    await page.getByRole('button', { name: 'Get API key' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(status === 404 ? 'No API key is available' : 'do not have permission');
    await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
    state.apiKeyStatus = 200;
    state.apiKeyBody = { status: true, data: { accountId: 'team-one', apiKey: 'test-only-recovered-key' } };
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('test-only-recovered-key');
    expect(state.crashes).toEqual([]);
  });
}

test('API key dialog rejects a response belonging to another workspace', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  state.apiKeyBody = { status: true, data: { accountId: 'team-two', apiKey: 'wrong-workspace-test-key' } };
  await page.getByRole('button', { name: 'Get API key' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Unable to read');
  await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('Administration preloads on the dashboard, deduplicates an in-flight fetch, and reuses fresh data', async ({ page }) => {
  let release;
  const meGate = new Promise((resolve) => { release = resolve; });
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', meGate });
  let releaseMembers;
  state.memberGate = new Promise((resolve) => { releaseMembers = resolve; });
  const memberPath = '/api/v1/enterprise/accounts/team-one/members';
  release();
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  await expect.poll(() => state.calls.filter((call) => call === memberPath).length).toBe(1);
  try {
    await page.getByRole('link', { name: 'Administration', exact: true }).click();
    await expect(page.getByText('Loading team…', { exact: true })).toBeVisible();
    expect(state.calls.filter((call) => call === memberPath)).toHaveLength(1);
  } finally { releaseMembers(); }
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  const count = state.calls.length;
  for (let visit = 0; visit < 2; visit += 1) {
    await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
    await page.getByRole('link', { name: 'Administration', exact: true }).click();
    await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
    await expect(page.getByText('Loading administration…', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Loading team…', { exact: true })).toHaveCount(0);
  }
  expect(state.calls).toHaveLength(count);
  expect(state.crashes).toEqual([]);
});

test('Administration keeps organization caches separate when switching back and forth', async ({ page }) => {
  let release;
  const meGate = new Promise((resolve) => { release = resolve; });
  const second = { ...enterprise, id: 'team-two', name: 'Second Team' };
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', accounts: [personal, enterprise, second], meGate });
  state.membersByAccount = {
    'team-one': [{ userId: 'one', displayName: 'First Organization Member', role: 'MEMBER', status: 'ACTIVE' }],
    'team-two': [{ userId: 'two', displayName: 'Second Organization Member', role: 'MEMBER', status: 'ACTIVE' }],
  };
  release();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('First Organization Member', { exact: true })).toBeVisible();
  await openProfileWorkspaces(page);
  await page.getByRole('menuitemradio', { name: 'Second Team' }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('Second Organization Member', { exact: true })).toBeVisible();
  await expect(page.getByText('First Organization Member', { exact: true })).toHaveCount(0);
  await openProfileWorkspaces(page);
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('First Organization Member', { exact: true })).toBeVisible();
  await expect(page.getByText('Second Organization Member', { exact: true })).toHaveCount(0);
  expect(state.calls.filter((call) => call.endsWith('/members'))).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

test('Administration manual refresh updates cached data without hiding the existing team', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  state.membersByAccount['team-one'] = [{ userId: 'new', displayName: 'Updated Member', role: 'MEMBER', status: 'ACTIVE' }];
  let release;
  state.memberGate = new Promise((resolve) => { release = resolve; });
  await page.getByRole('button', { name: 'Refresh team' }).click();
  try {
    await expect(page.getByText('Updating team…', { exact: true })).toBeVisible();
    await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh team' })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByText('Updated Member', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('Updated Member', { exact: true })).toBeVisible();
  expect(state.calls.filter((call) => call.endsWith('/members'))).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

test('failed Administration prefetch leaves the dashboard usable and supports retry on entry', async ({ page }) => {
  let release;
  const meGate = new Promise((resolve) => { release = resolve; });
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', meGate });
  state.memberStatus = 503;
  release();
  await expect.poll(() => state.calls.some((call) => call.endsWith('/members'))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Team data unavailable');
  state.memberStatus = 200;
  await page.getByRole('button', { name: 'Retry team data' }).click();
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('access-denied team responses hide cached rows and privileged controls', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  state.memberStatus = 403;
  await page.getByRole('button', { name: 'Refresh team' }).click();
  await expect(page.getByRole('alert')).toContainText('Team data unavailable');
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toHaveCount(0);
  state.memberStatus = 200;
  await page.getByRole('button', { name: 'Retry team data' }).click();
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Administration caches invitation filters separately and removes privileged data after demotion', async ({ page }) => {
  let release;
  const meGate = new Promise((resolve) => { release = resolve; });
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one', meGate });
  state.invitationsByAccount['team-one'] = [
    { invitationId: 'pending', invitedUserDisplayName: 'Pending Person', role: 'MEMBER', status: 'PENDING' },
    { invitationId: 'accepted', invitedUserDisplayName: 'Accepted Person', role: 'MEMBER', status: 'ACCEPTED' },
  ];
  release();
  await expect(page.getByText('Pending Person', { exact: true })).toBeVisible();
  await page.getByLabel('Invitation status').selectOption('ACCEPTED');
  await expect(page.getByText('Accepted Person', { exact: true })).toBeVisible();
  await page.getByLabel('Invitation status').selectOption('PENDING');
  await expect(page.getByText('Pending Person', { exact: true })).toBeVisible();
  expect(state.invitationRequests).toHaveLength(2);
  state.accounts = [personal, { ...enterprise, role: 'MEMBER' }];
  await page.getByRole('button', { name: 'Refresh team' }).click();
  await expect(page.getByText('Pending Person', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Invitation status')).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toHaveCount(0);
  expect(state.invitationRequests).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

test('Administration clears its cache on sign-out, even when the same user signs in again', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  state.membersByAccount['team-one'] = [{ userId: 'after', displayName: 'New Session Member', role: 'MEMBER', status: 'ACTIVE' }];
  await login(page);
  await page.getByRole('button', { name: 'Airabook Team', exact: true }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('New Session Member', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toHaveCount(0);
  expect(state.calls.filter((call) => call.endsWith('/members'))).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

test('Administration isolates query observers when the authenticated user changes directly', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  state.membersByAccount['team-one'] = [{ userId: 'second-session', displayName: 'Second User Team Data', role: 'MEMBER', status: 'ACTIVE' }];
  await page.evaluate(() => window.fixtureSwitchUser('second-fixture-user'));
  await expect(page.getByText('Second User Team Data', { exact: true })).toBeVisible();
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByText('Second User Team Data', { exact: true })).toBeVisible();
  expect(state.calls.filter((call) => call.endsWith('/members'))).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});

test('Administration shows stale cached rows while revalidating in the background', async ({ page }) => {
  await page.clock.install();
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one' });
  await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  state.membersByAccount['team-one'] = [{ userId: 'fresh', displayName: 'Fresh Member', role: 'MEMBER', status: 'ACTIVE' }];
  let release;
  state.memberGate = new Promise((resolve) => { release = resolve; });
  await page.clock.fastForward(61_000);
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  try {
    await expect(page.getByRole('row', { name: /Saroj \(you\)/ })).toBeVisible();
    await expect(page.getByText('Loading team…', { exact: true })).toHaveCount(0);
    await expect.poll(() => state.calls.filter((call) => call.endsWith('/members')).length).toBe(2);
  } finally { release(); }
  await expect(page.getByText('Fresh Member', { exact: true })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Enterprise choice opens the shared dashboard and Administration survives refresh', async ({ page }) => {
  const second = { ...enterprise, id: 'team-two', name: 'Second Team', slug: 'team-two' };
  const state = await fixture(page, { accounts: [personal, enterprise, second] });
  await login(page);
  await expect(page.getByRole('button', { name: 'Second Team', exact: true })).toHaveCSS('border-radius', '4px');
  await page.getByRole('button', { name: 'Second Team', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/enterprise-home\?accountId=team-two$/);
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Airabook Enterprise home' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Books', exact: true })).toBeVisible();
  await expect.poll(() => state.calls.includes('/api/v1/enterprise/accounts/team-two/members')).toBe(true);
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Second Team · Manage your team and account access.')).toBeVisible();
  expect(state.calls).toContain('/api/v1/enterprise/accounts/team-two/members');
  expect(state.crashes).toEqual([]);
});

test('Enterprise shares the creation landing page and content navigation, Personal has no Administration', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/dashboard', realDashboard: true, withBooks: true });
  await expect(page.getByRole('heading', { name: 'What do you want to create?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Airabook Team' }).click();
  await expect(page.getByRole('heading', { name: 'What do you want to create?' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Enterprise navigation' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Movies', exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Asset Registry', exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Search books, chapters, pages...')).toBeVisible();
  await page.screenshot({ path: '/tmp/airabook-enterprise-shared-dashboard.png' });
  await nav.getByRole('link', { name: 'Books', exact: true }).click();
  await expect(page).toHaveURL(/\/books\?accountId=team-one$/);
  await expect(page.getByRole('heading', { name: 'Books page' })).toBeVisible();
  await page.reload();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Books', exact: true })).toHaveAttribute('aria-current', 'page');
  await nav.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/enterprise-home\/administration\?accountId=team-one$/);
  await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Administration', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: '/tmp/airabook-enterprise-shared-administration.png' });
  await page.getByRole('button', { name: 'Switch workspace', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Personal account' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'What do you want to create?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('Enterprise mobile drawer opens Administration and returns to the shared dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one' });
  await page.getByRole('button', { name: 'Open enterprise navigation' }).click();
  await page.getByRole('link', { name: 'Administration', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close enterprise navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open enterprise navigation' }).click();
  await expect(page.getByRole('link', { name: 'Administration', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: '/tmp/airabook-enterprise-shared-mobile.png' });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/v2\/enterprise-home\?accountId=team-one$/);
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Enterprise context survives page actions without account query parameters', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/books?accountId=team-one' });
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await page.getByRole('button', { name: 'Open profile menu' }).click();
  await page.getByRole('menuitem', { name: 'Profile Settings' }).click();
  await expect(page).toHaveURL(/\/settings\?accountId=team-one$/);
  // Simulate an existing page's ordinary absolute navigation through browser history.
  await page.evaluate(() => {
    history.pushState({}, '', '/book/example?chapter=chapter-one#saved');
    dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/\/book\/example\?chapter=chapter-one&accountId=team-one#saved$/);
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Airabook Team' })).toHaveAttribute('aria-checked', 'true');
  expect(state.crashes).toEqual([]);
});

for (const [path, heading] of [
  ['/v2/enterprise-home', 'What do you want to create?'],
  ['/books', 'Books page'], ['/movies', 'Movies page'], ['/media', 'Media page'],
]) {
  test(`Enterprise ${path} renders before workspace validation on entry and refresh`, async ({ page }) => {
    let release;
    const meGate = new Promise((resolve) => { release = resolve; });
    const state = await fixture(page, {
      signedIn: true, initialRoute: `${path}?accountId=team-one`, meGate,
      realDashboard: path === '/v2/enterprise-home', withBooks: true,
    });
    try {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Personal workspace', { exact: true })).toHaveCount(0);
      const nav = page.getByRole('navigation', { name: 'Enterprise navigation' });
      await expect(nav).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Books', exact: true })).toHaveAttribute('href', '/books?accountId=team-one');
      await expect(nav.getByRole('link', { name: 'Administration', exact: true })).toBeVisible();
      if (path === '/v2/enterprise-home') await page.screenshot({ path: '/tmp/airabook-enterprise-immediate-dashboard.png' });
      await page.reload();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(nav).toBeVisible();
      await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
      expect(state.calls.filter((call) => call === '/api/v1/me').length).toBeGreaterThan(0);
    } finally { release(); }
    await expect(page.getByText('Airabook Team', { exact: true })).toBeVisible();
    expect(state.crashes).toEqual([]);
  });
}

test('Administration waits for validated access while common navigation remains visible', async ({ page }) => {
  let release;
  const meGate = new Promise((resolve) => { release = resolve; });
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home/administration?accountId=team-one', meGate });
  try {
    await expect(page.getByText('Loading administration…', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toHaveCount(0);
    expect(state.calls.some((call) => call.endsWith('/members'))).toBe(false);
  } finally { release(); }
  await expect(page.getByRole('heading', { name: 'Organization Overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

test('Enterprise shared-page access errors keep content visible and support retry', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', failMe: true });
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  state.failMe = true;
  await page.getByRole('link', { name: 'Books', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Workspace service unavailable');
  await expect(page.getByPlaceholder('Search books, chapters, pages...')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Books page' })).toBeVisible();
  state.failMe = false;
  await page.getByRole('button', { name: 'Retry workspace access' }).click();
  await expect(page.getByRole('heading', { name: 'Books page' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(state.crashes).toEqual([]);
});

test('unauthorized Enterprise account on shared content returns to the chooser', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, initialRoute: '/books?accountId=removed-team', preference: enterprise.id });
  await expect(page.getByRole('heading', { name: 'Choose a workspace' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Books page' })).toHaveCount(0);
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
  await expect(page.getByRole('link', { name: 'Request workspace', exact: true })).toHaveCSS('border-radius', '4px');
  await expect(page.locator('article').first()).toHaveCSS('border-radius', '24px');
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
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await expect(page.getByText('Airabook Team', { exact: true })).toBeVisible();
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

test('Enterprise profile switches organizations and persists the exact account', async ({ page }) => {
  const second = { ...enterprise, id: 'team-two', name: 'Second Team', slug: 'team-two' };
  const state = await fixture(page, { signedIn: true, initialRoute: '/v2/enterprise-home?accountId=team-one', accounts: [personal, enterprise, second] });
  await expect(page.getByRole('navigation', { name: 'Enterprise navigation' })).toBeVisible();
  await expect(page.getByText('Airabook Team', { exact: true })).toBeVisible();
  await expect(page.locator('header').getByRole('button', { name: 'Switch workspace', exact: true })).toHaveCount(0);
  await openProfileWorkspaces(page);
  await page.getByRole('menuitemradio', { name: 'Second Team' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard page' })).toBeVisible();
  await expect(page.getByText('Second Team', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/accountId=team-two$/);
  expect(await page.evaluate(() => localStorage.getItem('airabook:selected-workspace:fixture-user'))).toBe('team-two');
  await openProfileWorkspaces(page);
  await expect(page.getByRole('menuitemradio', { name: 'Second Team' })).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => state.calls.includes('/api/v1/enterprise/accounts/team-two/members')).toBe(true);
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
  const profileMenuTrigger = page.getByRole('button', { name: 'Open profile menu' });
  await profileMenuTrigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(profileMenuTrigger).toBeFocused();
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
    await expect(page.getByRole('menu')).toHaveCSS('border-radius', '6px');
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

for (const mobile of [false, true]) {
  test(`Enterprise request status appears in the ${mobile ? 'mobile' : 'desktop'} notification bell`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page, {
      signedIn: true, initialRoute: '/dashboard', realDashboard: true,
      onboardingRequests: [{ id: 'request-one', proposedAccountName: 'SK Travels', status: 'APPROVED' }],
      notificationPreview: { notifications: [{ id: 'book-invite', inviteId: 'invite-one', ownerName: 'Alex', bookTitle: 'Shared Stories' }] },
    });
    await expect(page.getByRole('heading', { name: 'What do you want to create?' })).toBeVisible();
    await expect.poll(() => state.calls.filter((path) => path.endsWith('/enterpriseOnboardingRequest/mine')).length).toBe(1);
    await expect(page.getByText('SK Travels: approved')).toHaveCount(0);
    const bell = page.getByRole('button', { name: 'Notifications', exact: true }).filter({ visible: true });
    await expect(bell).toHaveText('1');
    await bell.click();
    await expect(page.getByText('SK Travels: approved')).toBeVisible();
    await expect(page.getByText('Shared Stories', { exact: true })).toBeVisible();
    await bell.click();
    await expect(page.getByText('SK Travels: approved')).toHaveCount(0);
    await bell.click();
    await page.getByRole('link', { name: 'View request status' }).click();
    await expect(page).toHaveURL(/\/v2\/workspaces$/);
    expect(state.crashes).toEqual([]);
  });
}

for (const mobile of [false, true]) {
  test(`Deleting an enterprise notification persists on ${mobile ? 'mobile' : 'desktop'} without affecting other users`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const requests = [{ id: 'delete-request', proposedAccountName: 'Dismissed Team', status: 'APPROVED' }];
    const state = await fixture(page, {
      signedIn: true, initialRoute: '/dashboard', onboardingRequests: requests,
      notificationPreview: { notifications: [] },
    });
    const bell = page.getByRole('button', { name: 'Notifications', exact: true }).filter({ visible: true });
    await expect(bell).toHaveText('1');
    await bell.click();
    const remove = page.getByRole('button', { name: 'Delete enterprise request notification' });
    if (!mobile) {
      await expect(remove).toHaveCSS('opacity', '0');
      await page.getByText('Dismissed Team: approved').hover();
      await expect(remove).toHaveCSS('opacity', '1');
    }
    await remove.click();
    await expect(page.getByText('Dismissed Team: approved')).toHaveCount(0);
    await expect(bell).toHaveText('');
    await page.reload();
    await bell.click();
    await expect(page.getByText('No notifications', { exact: false }).filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'View request status' })).toHaveCount(0);
    await page.evaluate(() => window.fixtureSwitchUser('another-user'));
    await expect(bell).toHaveText('1');
    await bell.click();
    await expect(page.getByText('Dismissed Team: approved')).toBeVisible();
    expect(state.crashes).toEqual([]);
  });
}

const receivedInvitation = { invitationId: 'invite-one', accountName: 'Inviting Team', role: 'MEMBER' };
const receivedPath = '/api/v1/enterprise/invitations';

test('workspace hub reuses session queries and shares requests with the notification', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces',
    onboardingRequests: [{ id: 'request-one', proposedAccountName: 'Requested Team', requestedSlug: 'requested', status: 'SUBMITTED' }],
    receivedInvitations: [receivedInvitation],
  });
  await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
  await expect(page.getByText('Requested Team', { exact: true }).last()).toBeVisible();
  const reads = state.calls.filter((path) => path === receivedPath || path.includes('enterpriseOnboarding') || path === '/api/v1/me');
  await page.getByRole('link', { name: '← Dashboard' }).click();
  await page.locator('aside').getByRole('link', { name: 'Invitations & requests' }).click();
  await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
  expect(state.calls.filter((path) => reads.includes(path))).toEqual(reads);
  expect(reads.filter((path) => path.includes('enterpriseOnboarding'))).toHaveLength(1);
  expect(state.crashes).toEqual([]);
});

for (const action of ['Accept', 'Decline']) {
  test(`workspace hub ${action} refreshes invitations and workspace access without hiding content`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces', receivedInvitations: [receivedInvitation] });
    await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
    let release;
    state.responseGate = new Promise((resolve) => { release = resolve; });
    await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Decline', exact: true })).toBeDisabled();
    await expect(page.getByText('My Personal Workspace', { exact: true })).toBeVisible();
    release();
    await expect(page.getByText('No pending workspace invitations.')).toBeVisible();
    if (action === 'Accept') await expect(page.locator('article').getByText('Airabook Team', { exact: true })).toBeVisible();
    expect(state.calls.filter((path) => path.endsWith('/' + action.toLowerCase()))).toHaveLength(1);
    expect(state.calls.filter((path) => path === receivedPath)).toHaveLength(2);
    expect(state.calls.filter((path) => path === '/api/v1/me')).toHaveLength(2);
    expect(state.crashes).toEqual([]);
  });
}

test('workspace hub failed invitations can retry while other sections remain usable', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces', receivedStatus: 503 });
  await expect(page.getByRole('alert')).toContainText('Unable to load received invitations');
  await expect(page.getByText('No pending workspace invitations.')).toHaveCount(0);
  await expect(page.getByText('My Personal Workspace', { exact: true })).toBeVisible();
  state.receivedStatus = 200;
  state.receivedInvitations = [receivedInvitation];
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
  expect(state.crashes).toEqual([]);
});

for (const status of [409, 503]) {
  test(`workspace hub invitation HTTP ${status} preserves retryable actions`, async ({ page }) => {
    const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces', receivedInvitations: [receivedInvitation] });
    await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
    state.responseStatus = status;
    if (status === 409) state.receivedInvitations = [];
    await page.getByRole('button', { name: 'Accept', exact: true }).click();
    if (status === 409) await expect(page.getByText('No pending workspace invitations.')).toBeVisible();
    else {
      await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeEnabled();
      state.responseStatus = null;
      await page.getByRole('button', { name: 'Decline', exact: true }).click();
      await expect(page.getByText('No pending workspace invitations.')).toBeVisible();
    }
    expect(state.crashes).toEqual([]);
  });
}

for (const receivedStatus of [200, 503, 403]) {
  test(`workspace hub stale refresh HTTP ${receivedStatus} handles cached invitations`, async ({ page }) => {
    await page.clock.install();
    const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces', receivedInvitations: [receivedInvitation] });
    await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '← Dashboard' }).click();
    state.receivedStatus = receivedStatus;
    state.receivedInvitations = [{ ...receivedInvitation, accountName: 'Updated Invitation' }];
    let release;
    state.receivedGate = new Promise((resolve) => { release = resolve; });
    await page.clock.fastForward(61_000);
    await page.locator('aside').getByRole('link', { name: 'Invitations & requests' }).click();
    try {
      await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
      await expect(page.getByText('Loading workspace access…', { exact: true })).toHaveCount(0);
      await expect.poll(() => state.calls.filter((path) => path === receivedPath).length).toBe(2);
    } finally { release(); }
    if (receivedStatus === 200) await expect(page.getByText('Updated Invitation', { exact: true })).toBeVisible();
    else {
      await expect(page.getByRole('alert')).toContainText('Unable to load received invitations');
      await expect(page.getByText('Inviting Team', { exact: true })).toHaveCount(receivedStatus === 403 ? 0 : 1);
    }
    expect(state.crashes).toEqual([]);
  });
}

test('workspace hub clears received invitation cache on identity change', async ({ page }) => {
  const state = await fixture(page, { signedIn: true, accounts: [personal], initialRoute: '/v2/workspaces', receivedInvitations: [receivedInvitation] });
  await expect(page.getByText('Inviting Team', { exact: true })).toBeVisible();
  state.receivedInvitations = [];
  await page.evaluate(() => window.fixtureSwitchUser('another-user'));
  await expect(page.getByText('No pending workspace invitations.')).toBeVisible();
  await expect(page.getByText('Inviting Team', { exact: true })).toHaveCount(0);
  expect(state.calls.filter((path) => path === receivedPath)).toHaveLength(2);
  expect(state.crashes).toEqual([]);
});
