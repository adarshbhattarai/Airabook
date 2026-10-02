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

export const getWorkspacePath = (account) => (
  account?.type === 'ENTERPRISE' ? '/v2/enterprise-home' : '/dashboard'
);

/** Resolve a stored preference only against the backend's current /me memberships. */
export const getWorkspaceLandingPath = (profile, firebaseUid) => {
  const activeWorkspaces = getActiveWorkspaces(profile);
  const preferredId = getPreferredWorkspaceId(firebaseUid);
  const preferred = activeWorkspaces.find((account) => String(account.id) === String(preferredId));

  if (preferred) return getWorkspacePath(preferred);
  if (preferredId) clearPreferredWorkspaceId(firebaseUid);
  if (activeWorkspaces.length === 1) return getWorkspacePath(activeWorkspaces[0]);
  if (activeWorkspaces.length > 1) return '/v2/workspaces';
  return '/dashboard';
};

export const getSafeReturnLocation = (from) => {
  if (!from || typeof from.pathname !== 'string') return null;
  const { pathname, search = '', hash = '' } = from;
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return null;
  if (['/v2/login', '/v2/personal-login', '/v2/personal-signup', '/v2/enterprise-login'].includes(pathname)) {
    return null;
  }
  return { pathname, search, hash };
};
