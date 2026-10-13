import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getActiveWorkspaces, getSafeReturnLocation, getSelectedWorkspaceDestination,
  getWorkspaceLandingPath, getWorkspacePath, hasSystemAdminDestination,
} from '../src/services/workspaceSelection.js';

const personal = { id: 'personal', type: 'PERSONAL', accountStatus: 'ACTIVE', membershipStatus: 'ACTIVE' };
const enterprise = { ...personal, id: 'team / 2', type: 'ENTERPRISE', role: 'ADMIN' };
const profile = (accounts, systemRole = 'USER') => ({ accounts, user: { systemRole } });

test('only one Personal workspace bypasses chooser', () => {
  assert.equal(getWorkspaceLandingPath(profile([personal])), '/dashboard');
  assert.equal(getWorkspaceLandingPath(profile([personal, enterprise])), '/v2/chooseWorkspace');
  assert.equal(getWorkspaceLandingPath(profile([enterprise])), '/v2/chooseWorkspace');
  assert.equal(getWorkspaceLandingPath(profile([])), '/v2/chooseWorkspace');
});
test('platform Admin is a separate destination, not an Enterprise role', () => {
  assert.equal(hasSystemAdminDestination(profile([enterprise])), false);
  assert.equal(getWorkspaceLandingPath(profile([personal], 'SYSTEM_ADMIN')), '/v2/chooseWorkspace');
});
test('inactive account and membership statuses are excluded', () => {
  assert.deepEqual(getActiveWorkspaces(profile([personal, { ...enterprise, membershipStatus: 'REMOVED' }, { ...enterprise, accountStatus: 'SUSPENDED' }])), [personal]);
});
test('Enterprise destination encodes account identity in URL', () => {
  assert.equal(getWorkspacePath(enterprise), '/v2/enterprise-home?accountId=team%20%2F%202');
});
test('external and auth return locations are rejected', () => {
  for (const pathname of ['https://evil.test', '//evil.test', '/\\evil.test', '/login', '/signup', '/v2/personal-login', '/v2/chooseWorkspace']) assert.equal(getSafeReturnLocation({ pathname }), null);
});
test('Personal choice does not enter Enterprise or platform Admin context', () => {
  for (const pathname of ['/admin', '/admin/enterprise-approvals', '/v2/enterprise-home', '/v2/workspaces', '/', '/unknown']) {
    assert.equal(getSelectedWorkspaceDestination(personal, { pathname }).pathname, '/dashboard');
  }
});
test('Personal links preserve search/hash', () => {
  const from = { pathname: '/books', search: '?sort=recent', hash: '#saved' };
  assert.deepEqual(getSelectedWorkspaceDestination(personal, from), from);
});
test('Enterprise choice resumes only a matching account deep link', () => {
  const from = { pathname: '/v2/enterprise-home', search: '?accountId=team%20%2F%202', hash: '#team' };
  assert.deepEqual(getSelectedWorkspaceDestination(enterprise, from), from);
  assert.equal(getSelectedWorkspaceDestination(enterprise, { pathname: '/dashboard' }).pathname, '/v2/enterprise-home');
  assert.equal(getSelectedWorkspaceDestination(enterprise, { ...from, search: '?accountId=other' }).search, '?accountId=team%20%2F%202');
});
