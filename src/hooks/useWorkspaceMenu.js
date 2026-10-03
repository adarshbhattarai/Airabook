import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getCurrentEnterpriseUser } from '@/services/enterpriseOnboardingService';
import { getActiveWorkspaces, getPreferredWorkspaceId, getWorkspacePath, hasSystemAdminDestination, savePreferredWorkspaceId } from '@/services/workspaceSelection';

export const useWorkspaceMenu = ({ mode = 'personal', account } = {}) => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  useEffect(() => {
    requestVersion.current += 1;
    setProfile(null);
    setBusy(null);
    setLoading(false);
    setError('');
    return () => { requestVersion.current += 1; };
  }, [user?.uid]);

  const load = async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const me = await getCurrentEnterpriseUser();
      if (version !== requestVersion.current) return null;
      setProfile(me);
      return me;
    } catch (loadError) {
      if (version === requestVersion.current) {
        setProfile(null);
        setError(loadError.message || 'Unable to load workspace access. Please try again.');
      }
      return null;
    } finally { if (version === requestVersion.current) setLoading(false); }
  };

  const accounts = getActiveWorkspaces(profile);
  const enterpriseId = new URLSearchParams(location.search).get('accountId')
    || account?.id || location.state?.account?.id || getPreferredWorkspaceId(user?.uid);
  const current = mode === 'enterprise'
    ? accounts.find((item) => item.type === 'ENTERPRISE' && String(item.id) === String(enterpriseId))
    : mode === 'personal' ? accounts.find((item) => item.type === 'PERSONAL') : null;
  const selectedId = mode === 'admin' ? 'system-admin' : current?.id;
  const currentLabel = mode === 'admin' ? 'Admin dashboard' : mode === 'personal'
    ? 'Personal account' : current?.name || account?.name || 'Enterprise workspace';

  const select = async (id, onSelected) => {
    if (busy) return;
    setBusy(id);
    const version = requestVersion.current + 1;
    try {
      const me = await load();
      if (!me || version !== requestVersion.current) return;
      if (id === 'system-admin') {
        if (!hasSystemAdminDestination(me)) throw new Error('Your System Admin access is no longer available.');
        onSelected?.();
        if (mode !== 'admin') navigate('/admin/enterprise-approvals');
      } else {
        const authorized = getActiveWorkspaces(me).find((item) => String(item.id) === String(id));
        if (!authorized) throw new Error('This workspace is no longer available. Please choose another.');
        savePreferredWorkspaceId(user?.uid, authorized.id);
        onSelected?.();
        if (String(selectedId) !== String(authorized.id)) navigate(getWorkspacePath(authorized), { state: { account: authorized } });
      }
    } catch (selectionError) {
      if (version === requestVersion.current) setError(selectionError.message || 'Unable to switch workspace.');
    } finally { if (version === requestVersion.current) setBusy(null); }
  };

  const destinations = [
    ...accounts.filter((item) => item.type === 'ENTERPRISE').map((item) => ({ id: item.id, label: item.name, type: 'ENTERPRISE' })),
    ...accounts.filter((item) => item.type === 'PERSONAL').map((item) => ({ id: item.id, label: 'Personal account', type: 'PERSONAL' })),
    ...(hasSystemAdminDestination(profile) ? [{ id: 'system-admin', label: 'Admin dashboard', type: 'ADMIN' }] : []),
  ];
  return { load, select, loading, busy, error, destinations, selectedId, currentLabel };
};
