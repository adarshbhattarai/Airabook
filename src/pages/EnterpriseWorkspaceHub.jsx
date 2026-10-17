import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { WorkspaceBadge, WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Check, Clock3, Inbox, Loader2, ShieldCheck, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import {
  acceptEnterpriseInvitation,
  declineEnterpriseInvitation,
  getCurrentEnterpriseUser,
  getMyEnterpriseRequests,
  getReceivedEnterpriseInvitations,
} from '@/services/enterpriseOnboardingService';
import { getActiveWorkspaces, getWorkspacePath, savePreferredWorkspaceId } from '@/services/workspaceSelection';

const statusLabel = (status) => ({
  SUBMITTED: 'Pending System Admin review',
  UNDER_REVIEW: 'Under review',
  VERIFIED: 'Verification complete',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  PENDING_REVIEW: 'Pending System Admin review',
  ACTIVE: 'Approved',
  PENDING: 'Awaiting your response',
  ACCEPTED: 'Accepted',
  REVOKED: 'Revoked',
}[status] || status || 'Unknown');

const EnterpriseWorkspaceHub = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');

  const loadHub = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [me, myRequests, received] = await Promise.all([
        getCurrentEnterpriseUser(),
        getMyEnterpriseRequests(),
        getReceivedEnterpriseInvitations(),
      ]);
      setCurrentUser(me);
      setRequests(myRequests || []);
      setInvitations(received || []);
    } catch (loadError) {
      console.error('Unable to load Enterprise workspace hub', loadError);
      setError(loadError.message || 'Unable to load your workspace information.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const respondToInvitation = async (invitation, action) => {
    setActionId(invitation.invitationId);
    try {
      if (action === 'accept') await acceptEnterpriseInvitation(invitation.invitationId);
      else await declineEnterpriseInvitation(invitation.invitationId);
      toast({
        title: action === 'accept' ? 'Invitation accepted' : 'Invitation declined',
        description: action === 'accept' ? 'The workspace is now available to you.' : 'The invitation was declined.',
        variant: action === 'accept' ? 'appSuccess' : undefined,
      });
      await loadHub();
    } catch (actionError) {
      toast({ title: 'Unable to update invitation', description: actionError.message, variant: 'destructive' });
      if ([403, 404, 409].includes(actionError.status)) await loadHub();
    } finally {
      setActionId(null);
    }
  };

  const activeAccounts = getActiveWorkspaces(currentUser);

  const openWorkspace = (account) => {
    savePreferredWorkspaceId(user?.uid, account.id);
    navigate(getWorkspacePath(account), { state: { account } });
  };

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Link to="/dashboard" className="mb-6 inline-flex text-base font-medium text-primary hover:underline">← Dashboard</Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Workspace access</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">Your Airabook workspaces</h1>
            <p className="mt-2 max-w-2xl text-base leading-6 text-muted-foreground">Use one Personal Account to request, open, and join your approved Enterprise workspaces.</p>
          </div>
          <Button asChild variant="appPrimary">
            <Link to="/v2/enterprise-signup"><Building2 className="mr-2 h-4 w-4" />Request workspace</Link>
          </Button>
        </div>

        {error && <WorkspaceNotice role="alert" tone="danger" className="mt-6">{error}</WorkspaceNotice>}
        {loading && <div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading workspace access…</div>}

        {!loading && <div className="mt-8 space-y-6">
          <section>
            <SectionHeading icon={Building2} title="Active workspaces" detail="Your Personal workspace and approved Enterprise workspaces" />
            {activeAccounts.length === 0 ? (
              <EmptyState text="No approved Enterprise workspaces yet." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeAccounts.map((account) => <WorkspaceCard key={account.id} account={account} onOpen={() => openWorkspace(account)} />)}
              </div>
            )}
          </section>

          <section>
            <SectionHeading icon={Clock3} title="Your registration requests" detail="System Admin approval status" />
            {requests.length === 0 ? <EmptyState text="You have not submitted an Enterprise registration request." /> : (
              <div className="grid gap-4 md:grid-cols-2">
                {requests.map((request) => <RequestCard key={request.id} request={request} />)}
              </div>
            )}
          </section>

          <section>
            <SectionHeading icon={Inbox} title="Invitations for you" detail="Accept to join a workspace" />
            {invitations.length === 0 ? <EmptyState text="No pending workspace invitations." /> : (
              <div className="grid gap-4 md:grid-cols-2">
                {invitations.map((invitation) => (
                  <InvitationCard
                    key={invitation.invitationId}
                    invitation={invitation}
                    actionId={actionId}
                    onRespond={respondToInvitation}
                  />
                ))}
              </div>
            )}
          </section>

          {currentUser?.user?.systemRole === 'SYSTEM_ADMIN' && (
            <section aria-label="System administration" className="rounded-xl border border-border bg-primary/10 p-5 sm:flex sm:items-center sm:justify-between">
              <div><p className="text-base font-semibold text-primary">System administration</p><p className="mt-1 text-sm text-primary">Review Enterprise onboarding requests separately from workspace membership.</p></div>
              <Button onClick={() => navigate('/admin/enterprise-approvals')} variant="appPrimary" className="mt-4 sm:mt-0"><ShieldCheck className="mr-2 h-4 w-4" />Open admin dashboard</Button>
            </section>
          )}
        </div>}
      </div>
    </div>
  );
};

const SectionHeading = ({ icon: Icon, title, detail }) => (
  <div className="mb-3 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span><div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="text-sm text-muted-foreground">{detail}</p></div></div>
);

const EmptyState = ({ text }) => <Card className="border-dashed px-5 py-7 text-center text-sm text-muted-foreground shadow-none">{text}</Card>;

const WorkspaceCard = ({ account, onOpen }) => (
  <Card as="article" className="flex flex-wrap items-center justify-between gap-4 p-5">
    <div className="min-w-0 flex-1"><p className="truncate text-base font-semibold text-foreground">{account.name}</p><p className="mt-1 text-sm text-muted-foreground">{account.type === 'ENTERPRISE' ? `${account.slug}.airabook.com · ` : 'Personal workspace · '}{account.role}</p><WorkspaceBadge status={account.accountStatus} className="mt-3">{statusLabel(account.accountStatus)}</WorkspaceBadge></div>
    <Button onClick={onOpen} variant="appPrimary" className="shrink-0">Open <ArrowRight className="ml-2 h-4 w-4" /></Button>
  </Card>
);

const RequestCard = ({ request }) => {
  return <Card as="article" className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{request.proposedAccountName}</p><p className="mt-1 text-sm text-muted-foreground">{request.requestedSlug}.airabook.com</p></div><WorkspaceBadge status={request.status}>{statusLabel(request.status)}</WorkspaceBadge></div>{request.decisionReason && <p className="mt-4 text-sm leading-5 text-muted-foreground">{request.decisionReason}</p>}</Card>;
};

const InvitationCard = ({ invitation, actionId, onRespond }) => (
  <Card as="article" className="p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></span><div className="min-w-0"><p className="font-semibold text-foreground">{invitation.accountName}</p><p className="mt-1 text-sm text-muted-foreground">Invited by {invitation.invitedByDisplayName || 'a workspace administrator'} · {invitation.role}</p></div></div><div className="mt-5 flex gap-2"><Button disabled={actionId === invitation.invitationId} onClick={() => onRespond(invitation, 'accept')} variant="appPrimary"><Check className="mr-2 h-4 w-4" />Accept</Button><Button disabled={actionId === invitation.invitationId} onClick={() => onRespond(invitation, 'decline')} variant="outline"><X className="mr-2 h-4 w-4" />Decline</Button></div></Card>
);

export default EnterpriseWorkspaceHub;
