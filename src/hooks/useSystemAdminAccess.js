import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getCurrentEnterpriseUser } from '@/services/enterpriseOnboardingService';

/** Resolves admin access from the backend-owned application user role. */
export const useSystemAdminAccess = () => {
  const { user, loading: authLoading } = useAuth();
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [checkingSystemAdmin, setCheckingSystemAdmin] = useState(true);

  useEffect(() => {
    let active = true;

    if (authLoading) {
      setCheckingSystemAdmin(true);
      return () => { active = false; };
    }

    if (!user) {
      setIsSystemAdmin(false);
      setCheckingSystemAdmin(false);
      return () => { active = false; };
    }

    setCheckingSystemAdmin(true);
    setIsSystemAdmin(false);
    getCurrentEnterpriseUser()
      .then((profile) => {
        if (active) setIsSystemAdmin(profile?.user?.systemRole === 'SYSTEM_ADMIN');
      })
      .catch((error) => {
        console.warn('Unable to resolve System Admin access:', error?.message || error);
        if (active) setIsSystemAdmin(false);
      })
      .finally(() => {
        if (active) setCheckingSystemAdmin(false);
      });

    return () => { active = false; };
  }, [user, authLoading]);

  return { isSystemAdmin, checkingSystemAdmin };
};
