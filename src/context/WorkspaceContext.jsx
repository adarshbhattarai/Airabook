import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { workspaceAccessOptions, prefetchAdministration } from '@/services/enterpriseQueries';
import {
  clearPreferredWorkspaceId, getActiveWorkspaces, getPreferredWorkspaceId,
  savePreferredWorkspaceId, WORKSPACE_CHOOSER_PATH,
} from '@/services/workspaceSelection';

const WorkspaceContext = createContext(null);
export const useWorkspace = () => useContext(WorkspaceContext);

export const WorkspaceProvider = ({ children }) => {
  const { user } = useAuth();
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const explicitId = new URLSearchParams(location.search).get('accountId');
  const enterpriseRoute = location.pathname.startsWith('/v2/enterprise-home');
  const preferredId = getPreferredWorkspaceId(user?.uid);
  const [validatedSelection, setValidatedSelection] = useState(null);
  const retainedId = validatedSelection?.uid === user?.uid
    && String(validatedSelection.id) === preferredId ? preferredId : null;
  const candidateId = explicitId ?? (enterpriseRoute ? preferredId : retainedId);
  const needsResolution = candidateId !== null || enterpriseRoute;
  const access = useQuery({ ...workspaceAccessOptions(user?.uid), enabled: !!user?.uid && needsResolution });
  const profile = access.data;
  const active = getActiveWorkspaces(profile);
  const enterprise = active.filter((item) => item.type === 'ENTERPRISE');
  let account = needsResolution ? enterprise.find((item) => String(item.id) === candidateId) : null;
  if (!account && explicitId === null && enterpriseRoute && enterprise.length === 1) account = enterprise[0];
  const mode = needsResolution ? 'enterprise' : 'personal';
  const accountId = account?.id;
  const accountRole = account?.role;

  useEffect(() => {
    if (!needsResolution || !profile || access.error) return;
    if (!accountId) {
      clearPreferredWorkspaceId(user?.uid);
      navigate(WORKSPACE_CHOOSER_PATH, { replace: true });
      return;
    }
    savePreferredWorkspaceId(user?.uid, accountId);
    setValidatedSelection({ uid: user?.uid, id: accountId });
  }, [needsResolution, profile, access.error, accountId, user?.uid, navigate]);

  useEffect(() => {
    // Remove inaccessible accounts and former roles, including inactive filter caches.
    if (!profile && !access.error) return;
    const authorized = new Map(getActiveWorkspaces(profile).map((item) => [String(item.id), item.role]));
    const denied = [401, 403].includes(access.error?.status);
    client.removeQueries({ predicate: (query) => {
      const [type, uid, id, role] = query.queryKey;
      return type === 'enterprise-administration' && uid === user?.uid
        && (denied || authorized.get(id) !== role);
    } });
  }, [profile, access.error, client, user?.uid]);

  useEffect(() => {
    if (!accountId || !accountRole || access.error) return;
    prefetchAdministration(client, user?.uid, { id: accountId, role: accountRole });
  }, [accountId, accountRole, access.error, client, user?.uid]);

  useEffect(() => {
    if (mode !== 'enterprise' || explicitId !== null || !accountId) return;
    const search = new URLSearchParams(location.search);
    search.set('accountId', accountId);
    navigate({ pathname: location.pathname, search: `?${search}`, hash: location.hash }, { replace: true, state: location.state });
  }, [accountId, explicitId, mode, location.pathname, location.search, location.hash, location.state, navigate]);

  const pathFor = (path) => {
    const id = accountId ?? candidateId;
    if (mode !== 'enterprise' || id === null) return path;
    const url = new URL(path, 'https://airabook.invalid');
    url.searchParams.set('accountId', id);
    return `${url.pathname}${url.search}${url.hash}`;
  };
  return <WorkspaceContext.Provider value={{
    account, actorUser: profile?.user, mode, pathFor,
    loading: needsResolution && access.isPending,
    error: needsResolution ? access.error?.message : null,
    retry: () => access.refetch(),
    refreshAccess: () => access.refetch({ throwOnError: true }),
  }}>{children}</WorkspaceContext.Provider>;
};
