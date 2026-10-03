const preferenceKey = (firebaseUid) => `airabook:selected-workspace:${firebaseUid}`;

export const getActiveWorkspaces = (profile) => (profile?.accounts || []).filter((account) => (
  account.accountStatus === 'ACTIVE' && account.membershipStatus === 'ACTIVE'
));

export const getPreferredWorkspaceId = (firebaseUid) => {
  if (!firebaseUid || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(preferenceKey(firebaseUid));
  } catch {
    return null;
  }
};

export const savePreferredWorkspaceId = (firebaseUid, accountId) => {
  if (!firebaseUid || !accountId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(preferenceKey(firebaseUid), String(accountId));
  } catch {
    // Workspace preference is optional and must never block navigation.
  }
};

export const clearPreferredWorkspaceId = (firebaseUid) => {
  if (!firebaseUid || typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(preferenceKey(firebaseUid));
  } catch {
    // Ignore unavailable browser storage; the preference is not authorization.
  }
};

export const WORKSPACE_CHOOSER_PATH = '/v2/chooseWorkspace';

export const getWorkspacePath = (account) => (
  account?.type === 'ENTERPRISE'
    ? `/v2/enterprise-home?accountId=${encodeURIComponent(account.id)}` : '/dashboard'
);

export const hasSystemAdminDestination = (profile) => profile?.user?.systemRole === 'SYSTEM_ADMIN';

/** A saved preference helps refresh an open workspace, never bypasses the login chooser. */
export const getWorkspaceLandingPath = (profile) => {
  const activeWorkspaces = getActiveWorkspaces(profile);
  if (activeWorkspaces.length === 1 && activeWorkspaces[0].type === 'PERSONAL'
      && !hasSystemAdminDestination(profile)) return '/dashboard';
  return WORKSPACE_CHOOSER_PATH;
};

export const getSafeReturnLocation = (from) => {
  if (!from || typeof from.pathname !== 'string') return null;
  const { pathname, search = '', hash = '' } = from;
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) return null;
  if (['/login', '/signup', '/v2/login', '/v2/personal-login', '/v2/personal-signup', '/v2/enterprise-login', WORKSPACE_CHOOSER_PATH].includes(pathname)) {
    return null;
  }
  return { pathname, search: typeof search === 'string' ? search : '', hash: typeof hash === 'string' ? hash : '' };
};

/** Resume a deep link only inside the destination the user actually chose. */
export const getSelectedWorkspaceDestination = (account, from) => {
  const safe = getSafeReturnLocation(from);
  const personalRoutes = ['/dashboard', '/books', '/book', '/movies', '/notifications', '/media', '/notes',
    '/create-book', '/baby-journal-preview', '/billing', '/donate', '/settings',
    '/v2/enterprise-signup', '/v2/enterprise-request-pending'];
  if (safe && account.type === 'PERSONAL'
      && personalRoutes.some((path) => safe.pathname === path || safe.pathname.startsWith(`${path}/`))) return safe;
  if (safe && account.type === 'ENTERPRISE' && safe.pathname === '/v2/enterprise-home'
      && new URLSearchParams(safe.search).get('accountId') === String(account.id)) return safe;
  const url = new URL(getWorkspacePath(account), 'https://airabook.invalid');
  return { pathname: url.pathname, search: url.search };
};
