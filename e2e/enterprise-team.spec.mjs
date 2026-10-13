import { test, expect } from '@playwright/test';

const accountId = '00000000-0000-0000-0000-000000000010';
const ownerId = '00000000-0000-0000-0000-000000000001';
const memberId = '00000000-0000-0000-0000-000000000002';
const peerAdminId = '00000000-0000-0000-0000-000000000003';
const targetId = '00000000-0000-0000-0000-000000000004';
const invitationId = '00000000-0000-0000-0000-000000000020';

async function fixture(page, { role = 'OWNER', view = 'home' } = {}) {
  const account = { id: accountId, type: 'ENTERPRISE', name: 'Team Workspace', slug: 'team', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role };
  const state = {
    account,
    members: [
      { userId: ownerId, displayName: 'Workspace Owner', email: 'owner@example.test', role: 'OWNER', status: 'ACTIVE' },
      { userId: memberId, displayName: 'Team Member', email: 'member@example.test', role: 'MEMBER', status: 'ACTIVE' },
      { userId: peerAdminId, displayName: 'Peer Admin', email: 'admin@example.test', role: 'ADMIN', status: 'ACTIVE' },
    ],
    invitations: view === 'inbox' ? [{ invitationId, accountId, accountName: 'Team Workspace', accountSlug: 'team', invitedUserId: targetId, invitedUserEmail: 'target@example.test', invitedUserDisplayName: 'Target User', invitedByDisplayName: 'Workspace Owner', role: 'MEMBER', status: 'PENDING' }] : [],
    calls: [],
    conflict: false,
  };
  const crashes = [];
  page.on('pageerror', (error) => crashes.push(error.message));
  await page.route('**/src/context/AuthContext.jsx*', (route) => route.fulfill({ contentType: 'text/javascript', body: `export const useAuth = () => ({ user: { uid: 'test-user' } });` }));
  await page.route('**/src/lib/firebase.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: `export const auth = {currentUser: {getIdToken: async () => 'fixture-token'}};` }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = request.postDataJSON();
    state.calls.push({ path, method, body });
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    if (path === '/api/v1/me') return reply({ user: { id: view === 'inbox' ? targetId : ownerId, status: 'ACTIVE', systemRole: 'USER' }, accounts: view === 'inbox'
      ? [{ id: 'personal', type: 'PERSONAL', name: 'Personal', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE', role: 'PERSONAL_OWNER' }, ...(state.invitations.some((i) => i.status === 'ACCEPTED') ? [account] : [])]
      : [account] });
    if (path === '/api/v1/enterpriseOnboardingRequest/mine') return reply({ items: [] });
    if (path === '/api/v1/enterprise/invitations' && method === 'GET') return reply(state.invitations.filter((i) => i.status === 'PENDING'));
    if (path.endsWith('/members') && method === 'GET') return reply(state.members);
    if (path.endsWith('/eligibleUsers')) return reply(url.searchParams.get('query') === 'target@example.test'
      ? [{ userId: targetId, displayName: 'Target User', email: 'target@example.test' }] : []);
    if (path.endsWith('/invitations') && method === 'GET') return reply(state.invitations.filter((i) => i.status === url.searchParams.get('status')));
    if (path.endsWith('/invitations') && method === 'POST') {
      const invitation = { invitationId, accountId, invitedUserId: body.userId, invitedUserEmail: 'target@example.test', invitedUserDisplayName: 'Target User', role: body.role, status: 'PENDING' };
      state.invitations.push(invitation); return reply(invitation, 201);
    }
    if (state.conflict && method !== 'GET') { state.conflict = false; return reply({ message: 'Membership changed; refresh and try again' }, 409); }
    if (path.includes('/members/')) {
      const target = state.members.find((m) => path.includes(m.userId));
      if (path.endsWith('/role')) target.role = body.role;
      else target.status = method === 'DELETE' ? 'REMOVED' : body.status;
      if (method === 'DELETE') return route.fulfill({ status: 204 });
      return reply(target);
    }
    if (path.includes('/invitations/')) {
      const target = state.invitations.find((i) => path.includes(i.invitationId));
      target.status = method === 'DELETE' ? 'REVOKED' : path.endsWith('/accept') ? 'ACCEPTED' : 'DECLINED';
      if (method === 'DELETE') return route.fulfill({ status: 204 });
      return reply(target);
    }
    return reply({ message: `Unhandled fixture endpoint: ${path}` }, 500);
  });
  await page.goto(`/e2e/fixtures/enterpriseWorkspace.html?view=${view}`);
  if (view === 'home') await expect(page.getByRole('row', { name: /Team Member/ })).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Accept', exact: true })).toBeVisible();
  expect(crashes).toEqual([]);
  return { state, crashes };
}

const memberRow = (page) => page.getByRole('row', { name: /Team Member/ });
async function confirm(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status', { name: /Loading/ })).toHaveCount(0);
}

test('owner searches exact user and invites MEMBER without creating a membership', async ({ page }) => {
  const { state, crashes } = await fixture(page);
  await page.getByRole('button', { name: 'Invite user', exact: true }).click();
  await page.getByLabel('Full email or exact display name').fill('target');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await expect(page.getByText('No eligible user found.', { exact: false })).toBeVisible();
  await page.getByLabel('Full email or exact display name').fill('target@example.test');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('button', { name: /Target User.*target@example.test/ }).click();
  await expect(page.getByLabel('Workspace role')).toHaveValue('MEMBER');
  await expect(page.getByLabel('Workspace role').getByRole('option')).toHaveText(['Member', 'Admin']);
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Target User', { exact: true })).toBeVisible();
  expect(state.invitations[0].role).toBe('MEMBER');
  expect(state.members).toHaveLength(3);
  expect(crashes).toEqual([]);
});

test('owner can change role, suspend, restore, and remove with refreshed status', async ({ page }) => {
  const { state } = await fixture(page);
  await memberRow(page).getByRole('button', { name: 'Change role' }).click();
  await page.getByLabel('New role').selectOption('ADMIN');
  await confirm(page);
  await expect(memberRow(page).getByRole('cell', { name: 'Admin', exact: true })).toBeVisible();
  await memberRow(page).getByRole('button', { name: 'Suspend', exact: true }).click(); await confirm(page);
  await expect(memberRow(page).getByRole('cell', { name: 'Suspended', exact: true })).toBeVisible();
  await memberRow(page).getByRole('button', { name: 'Restore', exact: true }).click(); await confirm(page);
  await expect(memberRow(page).getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
  await memberRow(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('new invitation and acceptance'); await confirm(page);
  await expect(memberRow(page)).toHaveCount(0);
  await page.getByLabel('Members', { exact: true }).selectOption('REMOVED');
  await expect(memberRow(page)).toContainText('Requires a new invitation');
  expect(state.members.find((m) => m.userId === memberId).status).toBe('REMOVED');
});

test('admin can invite only MEMBER and cannot change peer admin or owner', async ({ page }) => {
  await fixture(page, { role: 'ADMIN' });
  await expect(page.getByRole('row', { name: /Peer Admin/ }).getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Workspace Owner/ }).getByRole('button')).toHaveCount(0);
  await expect(memberRow(page).getByRole('button', { name: 'Change role' })).toHaveCount(0);
  await expect(memberRow(page).getByRole('button', { name: 'Suspend' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite user', exact: true }).click();
  await expect(page.getByLabel('Workspace role').getByRole('option')).toHaveText(['Member']);
});

test('MEMBER can view team without privileged action controls', async ({ page }) => {
  await fixture(page, { role: 'MEMBER' });
  await expect(page.getByRole('button', { name: 'Invite user', exact: true })).toHaveCount(0);
  await expect(page.getByRole('table').getByRole('button')).toHaveCount(0);
  await expect(page.getByLabel('Invitation status')).toHaveCount(0);
});

test('pending invitation can be revoked and viewed in history', async ({ page }) => {
  const { state } = await fixture(page);
  state.invitations.push({ invitationId, invitedUserEmail: 'target@example.test', role: 'MEMBER', status: 'PENDING' });
  await page.getByRole('button', { name: 'Refresh team' }).click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click(); await confirm(page);
  await expect(page.getByRole('button', { name: 'Revoke', exact: true })).toHaveCount(0);
  await page.getByLabel('Invitation status').selectOption('REVOKED');
  await expect(page.getByText('target@example.test · Member · Revoked')).toBeVisible();
});

test('stale membership conflict displays message and revalidates account', async ({ page }) => {
  const { state } = await fixture(page);
  state.conflict = true;
  await memberRow(page).getByRole('button', { name: 'Suspend', exact: true }).click(); await confirm(page);
  await expect(page.getByRole('alert').filter({ hasText: 'Membership changed' })).toBeVisible();
  await expect(memberRow(page).getByRole('cell', { name: 'Active', exact: true })).toBeVisible();
  expect(state.calls.filter((call) => call.path === '/api/v1/me').length).toBeGreaterThan(1);
});

test('recipient acceptance refreshes workspace list', async ({ page }) => {
  const { state } = await fixture(page, { view: 'inbox' });
  await page.getByRole('button', { name: 'Accept', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: 'Team Workspace' }).getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  expect(state.invitations[0].status).toBe('ACCEPTED');
});

test('recipient decline does not add workspace', async ({ page }) => {
  const { state } = await fixture(page, { view: 'inbox' });
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  await expect(page.getByRole('article').filter({ hasText: 'Team Workspace' })).toHaveCount(0);
  expect(state.invitations[0].status).toBe('DECLINED');
});
