import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WorkspaceBadge, WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { ArrowUpRight, Building2, Globe2, ShieldCheck, Users } from 'lucide-react';
import EnterpriseTeamManagement from '@/components/workspace/EnterpriseTeamManagement';
import EnterpriseApiKeyDialog from '@/components/workspace/EnterpriseApiKeyDialog';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { getActiveWorkspaces } from '@/services/workspaceSelection';
import { administrationKey, memberQueryOptions, invitationQueryOptions } from '@/services/enterpriseQueries';

const formatRole = (role) => {
  if (!role) return '—';
  return role.charAt(0) + role.slice(1).toLowerCase();
};

const getWebsiteUrl = (website) => {
  if (typeof website !== 'string' || !website.trim()) return null;
  try {
    const url = new URL(website.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

const EnterpriseHome = () => {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const client = useQueryClient();
  const account = workspace.account;
  const websiteUrl = getWebsiteUrl(account?.website);
  const [invitationStatus, setInvitationStatus] = useState('PENDING');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const enabled = !!account && !workspace.loading && !workspace.error;
  const canInvite = ['OWNER', 'ADMIN'].includes(account?.role);
  const memberQuery = useQuery({ ...memberQueryOptions(user?.uid, account), enabled });
  const invitationQuery = useQuery({
    ...invitationQueryOptions(user?.uid, account, invitationStatus), enabled: enabled && canInvite,
  });
  const queryError = memberQuery.error || (canInvite && invitationQuery.error);
  const accessDenied = [401, 403, 404].includes(queryError?.status);
  const members = accessDenied ? [] : memberQuery.data || [];
  const invitations = accessDenied ? [] : invitationQuery.data || [];
  const isLoading = workspace.loading || !account || memberQuery.isPending;
  const loadError = refreshError || workspace.error || queryError?.message;

  const refresh = async () => {
    if (!account || refreshing) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      const root = administrationKey(user?.uid, account.id);
      await client.cancelQueries({ queryKey: root });
      await client.invalidateQueries({ queryKey: root, refetchType: 'none' });
      // Refresh permissions after every mutation/conflict before reloading private data.
      const result = await workspace.refreshAccess();
      const authorized = getActiveWorkspaces(result.data).find((item) => String(item.id) === String(account.id));
      if (!authorized) return;
      await Promise.all([
        client.fetchQuery(memberQueryOptions(user?.uid, authorized)),
        ...(['OWNER', 'ADMIN'].includes(authorized.role)
          ? [client.fetchQuery(invitationQueryOptions(user?.uid, authorized, invitationStatus))] : []),
      ]);
    } catch (error) {
      setRefreshError(error.message || 'Unable to refresh team data.');
    } finally { setRefreshing(false); }
  };

  return (
    <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9 xl:px-12">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Management Studio · Enterprise</p>
        <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">Organization Overview</h1><WorkspaceBadge status="ACTIVE">All systems operational</WorkspaceBadge></div>
        <p className="mt-2 text-base text-muted-foreground">{account?.name || 'Loading workspace…'} · Manage your team and account access.</p>
        {websiteUrl && <div className="mt-2 flex items-start gap-2 text-sm">
          <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Website:</span>
          <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-primary underline-offset-4 hover:underline focus-visible:underline">
            {account.website.trim()}<ArrowUpRight aria-hidden="true" className="ml-1 inline h-3.5 w-3.5" />
          </a>
        </div>}
        </div>
        {!accessDenied && account && (account.role === 'OWNER' || workspace.actorUser?.systemRole === 'SYSTEM_ADMIN')
          && <EnterpriseApiKeyDialog key={`${user?.uid}:${account.id}`} account={account} />}
      </div>

      {loadError && <WorkspaceNotice role="alert" tone="danger" className="mb-6">{loadError}<Button variant="outline" className="ml-3" disabled={refreshing} onClick={refresh}>Retry team data</Button></WorkspaceNotice>}

      <section className="grid gap-4 md:grid-cols-3" aria-label="Organization metrics">
        <OverviewCard label="Team members" value={isLoading ? '…' : members.filter((member) => member.status === 'ACTIVE').length} detail="Active memberships" icon={Users} iconClass="bg-primary/10 text-primary" />
        <OverviewCard label="Workspace" value={account?.slug || '…'} detail={account?.accountStatus || 'Loading'} icon={Building2} iconClass="bg-primary/10 text-primary" />
        <OverviewCard label="Your role" value={formatRole(accessDenied ? null : account?.role)} detail="Workspace access" icon={ShieldCheck} iconClass="bg-primary/10 text-primary" />
      </section>

      <EnterpriseTeamManagement
        account={accessDenied ? null : account}
        actorUserId={workspace.actorUser?.id}
        members={members}
        invitations={invitations}
        isLoading={isLoading}
        isRefreshing={refreshing}
        isInvitationsLoading={canInvite && invitationQuery.isPending}
        invitationStatus={invitationStatus}
        onInvitationStatusChange={setInvitationStatus}
        onRefresh={refresh}
      />
    </div>
  );
};

const OverviewCard = ({ label, value, detail, icon: Icon, iconClass }) => (
  <Card as="article" className="p-5">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-4 w-4" /></span></div>
    <p className="mt-4 break-words text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">{detail}</p>
  </Card>
);

export default EnterpriseHome;
