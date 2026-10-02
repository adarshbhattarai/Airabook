import { getCurrentEnterpriseUser } from '@/services/enterpriseOnboardingService';
import { getSafeReturnLocation, getWorkspaceLandingPath } from '@/services/workspaceSelection';

/** Load authoritative memberships after Firebase auth, then resolve a UI destination. */
export const getPostLoginDestination = async (firebaseUid, from) => {
  const returnLocation = getSafeReturnLocation(from);
  if (returnLocation) return returnLocation;

  try {
    const profile = await getCurrentEnterpriseUser();
    return { pathname: getWorkspaceLandingPath(profile, firebaseUid) };
  } catch (error) {
    console.warn('Unable to load workspace memberships after sign-in:', error?.message || error);
    return { pathname: '/dashboard' };
  }
};
