import { getCurrentEnterpriseUser } from '@/services/enterpriseOnboardingService';
import { getActiveWorkspaces, getSafeReturnLocation, getSelectedWorkspaceDestination, getWorkspaceLandingPath, savePreferredWorkspaceId, WORKSPACE_CHOOSER_PATH } from '@/services/workspaceSelection';

/** Load authoritative memberships after Firebase auth, then resolve a UI destination. */
export const getPostLoginDestination = async (firebaseUid, from) => {
  const returnLocation = getSafeReturnLocation(from);
  try {
    const profile = await getCurrentEnterpriseUser();
    const pathname = getWorkspaceLandingPath(profile);
    if (pathname === '/dashboard') {
      const personal = getActiveWorkspaces(profile)[0];
      savePreferredWorkspaceId(firebaseUid, personal.id);
      return getSelectedWorkspaceDestination(personal, returnLocation);
    }
    return { pathname, state: { from: returnLocation } };
  } catch (error) {
    console.warn('Unable to load workspace memberships after sign-in:', error?.message || error);
    // Do not silently enter a workspace when its current access could not be loaded.
    return { pathname: WORKSPACE_CHOOSER_PATH, state: { from: returnLocation } };
  }
};
