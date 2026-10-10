import React, { useRef, useState } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  createEnterpriseInvitation, getEligibleEnterpriseUsers, removeEnterpriseMember,
  revokeEnterpriseInvitation, updateEnterpriseMemberRole, updateEnterpriseMemberStatus,
} from '@/services/enterpriseOnboardingService';
import {
  canChangeEnterpriseMemberRole, canInviteEnterpriseUsers, canManageEnterpriseMember,
  canRevokeEnterpriseInvitation, enterpriseInvitableRoles,
} from '@/services/enterpriseTeamPolicy';

const teamApi = {
  createEnterpriseInvitation, getEligibleEnterpriseUsers, removeEnterpriseMember,
  revokeEnterpriseInvitation, updateEnterpriseMemberRole, updateEnterpriseMemberStatus,
};
const label = (value) => value ? value[0] + value.slice(1).toLowerCase() : '—';
const nameOf = (member) => member.displayName || member.email || 'Unnamed member';
const inputClass = 'h-11 w-full rounded-[8px] border border-slate-300 bg-white px-3 text-base text-slate-900';
const actionErrorMessage = (error) => error.status === 409
  ? `This change conflicts with the current workspace state. ${error.message || 'Refresh and try again.'}`
  : error.message || 'Unable to update workspace access.';

const InviteDialog = ({ account, api, onCreated, onConflict, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState('MEMBER');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const searchVersion = useRef(0);
  const allowedRoles = enterpriseInvitableRoles(account.role);

  const reset = () => {
    searchVersion.current += 1;
    setQuery(''); setResults(null); setSelected(null); setRole('MEMBER'); setError(''); setSearching(false);
  };
  const changeOpen = (nextOpen) => {
    if (submitting) return;
    reset();
    setOpen(nextOpen);
  };
  const search = async (event) => {
    event.preventDefault();
    const version = ++searchVersion.current;
    setSearching(true); setError(''); setSelected(null); setResults(null);
    try {
      const users = await api.getEligibleEnterpriseUsers(account.id, query.trim());
      if (version === searchVersion.current) setResults(users);
    } catch (searchError) {
      if (version === searchVersion.current) setError(searchError.message || 'Unable to find registered users.');
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  };
  const send = async () => {
    if (!selected || submitting || !allowedRoles.includes(role)) return;
    setSubmitting(true); setError('');
    try {
      await api.createEnterpriseInvitation(account.id, { userId: selected.userId, role });
      setOpen(false); reset(); onCreated();
    } catch (sendError) {
      setError(actionErrorMessage(sendError));
      if ([403, 404, 409].includes(sendError.status)) {
        setSelected(null); setResults(null); onConflict();
      }
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button disabled={disabled} onClick={() => changeOpen(true)} className="rounded-[8px] bg-violet-700 text-white hover:bg-violet-800"><Users className="mr-2 h-4 w-4" />Invite user</Button>
      <DialogContent className="max-w-lg rounded-[8px] bg-white p-6 text-slate-900 shadow-xl">
        <DialogHeader>
          <DialogTitle>Invite a registered user</DialogTitle>
          <DialogDescription>Find a person by their full email or exact display name. They must have signed in to Airabook before you can invite them.</DialogDescription>
        </DialogHeader>
        <form onSubmit={search} className="mt-5 space-y-2">
          <label htmlFor="enterprise-invite-query" className="text-base font-medium">Full email or exact display name</label>
          <div className="flex gap-2">
            <input id="enterprise-invite-query" autoComplete="off" maxLength={255} required value={query} disabled={submitting}
              onChange={(event) => { searchVersion.current += 1; setSearching(false); setQuery(event.target.value); setSelected(null); setResults(null); setError(''); }}
              className={inputClass} />
            <Button className="rounded-[8px]" type="submit" disabled={searching || submitting || !query.trim()} variant="outline">{searching ? 'Searching…' : 'Find'}</Button>
          </div>
        </form>
        {results?.length === 0 && <p role="status" className="mt-4 text-base text-slate-600">No eligible user found. Check the exact spelling; existing members and pending invitees are excluded.</p>}
        {results?.length > 0 && <div className="mt-4 max-h-48 space-y-2 overflow-y-auto" aria-label="Eligible users">
          {results.map((person) => <button key={person.userId} type="button" disabled={submitting} aria-pressed={selected?.userId === person.userId}
            onClick={() => setSelected(person)} className={`w-full rounded-[8px] border p-3 text-left ${selected?.userId === person.userId ? 'border-violet-600 bg-violet-50' : 'border-slate-200'}`}>
            <span className="block text-base font-medium">{nameOf(person)}</span><span className="block text-sm text-slate-600">{person.email}</span>
          </button>)}
        </div>}
        <div className="mt-4 space-y-2">
          <label htmlFor="enterprise-invite-role" className="text-base font-medium">Workspace role</label>
          <select id="enterprise-invite-role" value={role} disabled={submitting} onChange={(event) => setRole(event.target.value)} className={inputClass}>
            {allowedRoles.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </div>
        <p className="mt-3 text-sm text-slate-500">Workspace access begins only after the recipient accepts in their workspace hub.</p>
        {error && <p role="alert" className="mt-3 text-base text-rose-700">{error}</p>}
        <DialogFooter className="mt-6 gap-2">
          <Button className="rounded-[8px]" variant="outline" disabled={submitting} onClick={() => changeOpen(false)}>Cancel</Button>
          <Button disabled={submitting || !selected || !allowedRoles.includes(role)} onClick={send} className="rounded-[8px] bg-violet-700 text-white hover:bg-violet-800">{submitting ? 'Sending…' : 'Send invitation'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EnterpriseTeamManagement = ({
  account, actorUserId, members = [], invitations = [], isLoading = false,
  invitationStatus = 'PENDING', onInvitationStatusChange, onRefresh, api = teamApi,
}) => {
  const { toast } = useToast();
  const [memberFilter, setMemberFilter] = useState('CURRENT');
  const [pendingAction, setPendingAction] = useState(null);
  const [requestedRole, setRequestedRole] = useState('MEMBER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canInvite = canInviteEnterpriseUsers(account?.role);
  const shownMembers = members.filter((member) => memberFilter === 'ALL'
    || memberFilter === 'CURRENT' && ['ACTIVE', 'SUSPENDED'].includes(member.status)
    || member.status === memberFilter);

  const openAction = (kind, target) => {
    setError(''); setPendingAction({ kind, target }); setRequestedRole(target.role || 'MEMBER');
  };
  const confirmAction = async () => {
    if (!pendingAction || busy || isLoading || !account) return;
    const { kind, target } = pendingAction;
    setBusy(true); setError('');
    try {
      if (kind === 'role') await api.updateEnterpriseMemberRole(account.id, target.userId, requestedRole);
      else if (kind === 'remove') await api.removeEnterpriseMember(account.id, target.userId);
      else if (kind === 'revoke') await api.revokeEnterpriseInvitation(target.invitationId);
      else await api.updateEnterpriseMemberStatus(account.id, target.userId, kind === 'suspend' ? 'SUSPENDED' : 'ACTIVE');
      setPendingAction(null);
      toast({ title: 'Workspace access updated', variant: 'appSuccess' });
      onRefresh();
    } catch (mutationError) {
      setError(actionErrorMessage(mutationError));
      setPendingAction(null);
      onRefresh();
    } finally { setBusy(false); }
  };
  const actionTitle = pendingAction && ({ role: 'Change member role', suspend: 'Suspend member', restore: 'Restore member', remove: 'Remove member', revoke: 'Revoke invitation' }[pendingAction.kind]);
  const actionDescription = pendingAction && ({
    role: `Update the workspace permissions for ${nameOf(pendingAction.target)}.`,
    suspend: `Suspend ${nameOf(pendingAction.target)}. They will lose access to this workspace until restored.`,
    restore: `Restore workspace access for ${nameOf(pendingAction.target)}.`,
    remove: `Remove ${nameOf(pendingAction.target)} from this workspace. Rejoining will require a new invitation and acceptance.`,
    revoke: `Revoke the pending invitation for ${pendingAction.target.invitedUserEmail}.`,
  }[pendingAction.kind]);

  return (
    <section aria-label="Team management" className="mt-6 rounded-[8px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 className="text-lg font-semibold text-slate-900">Team management</h2><p className="mt-1 text-sm text-slate-500">Manage workspace roles, access, and invitations.</p></div>
        <div className="flex gap-2">
          <Button className="rounded-[8px]" variant="outline" disabled={isLoading || busy} onClick={onRefresh} aria-label="Refresh team"><RefreshCw className="h-4 w-4" /></Button>
          {canInvite && <InviteDialog key={account.id} account={account} api={api} disabled={isLoading || busy}
            onConflict={onRefresh} onCreated={() => { setError(''); toast({ title: 'Invitation created', description: 'The recipient can respond from their workspace hub.', variant: 'appSuccess' }); onRefresh(); }} />}
        </div>
      </div>
      {error && <p role="alert" className="m-5 rounded-[8px] bg-rose-50 p-3 text-base text-rose-700">{error}</p>}
      <div className="flex items-center gap-3 px-5 py-4">
        <label htmlFor="enterprise-member-filter" className="text-base text-slate-600">Members</label>
        <select id="enterprise-member-filter" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} className="rounded-[8px] border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
          <option value="CURRENT">Active and suspended</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="REMOVED">Removed</option><option value="ALL">All history</option>
        </select>
      </div>
      {isLoading ? <p role="status" className="flex items-center justify-center gap-2 p-8 text-base text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading team…</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-base">
          <thead className="bg-slate-50 text-sm text-slate-600"><tr><th className="px-5 py-3">Member</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody>{shownMembers.map((member) => <tr key={member.userId} className="border-t border-slate-100">
            <td className="px-5 py-4"><span className="block font-medium text-slate-900">{nameOf(member)}{member.userId === actorUserId ? ' (you)' : ''}</span><span className="text-sm text-slate-500">{member.email}</span></td>
            <td className="px-3 py-4 text-slate-700">{label(member.role)}</td><td className="px-3 py-4 text-slate-700">{label(member.status)}</td>
            <td className="px-5 py-4"><div className="flex flex-wrap gap-2">
              {canChangeEnterpriseMemberRole(account?.role, member) && <Button className="rounded-[8px]" size="sm" variant="outline" disabled={busy} onClick={() => openAction('role', member)}>Change role</Button>}
              {canManageEnterpriseMember(account?.role, member) && <>
                <Button className="rounded-[8px]" size="sm" variant="outline" disabled={busy} onClick={() => openAction(member.status === 'ACTIVE' ? 'suspend' : 'restore', member)}>{member.status === 'ACTIVE' ? 'Suspend' : 'Restore'}</Button>
                <Button className="rounded-[8px]" size="sm" variant="outline" disabled={busy} onClick={() => openAction('remove', member)}>Remove</Button>
              </>}
              {member.role === 'OWNER' && <span className="text-sm text-slate-500">Protected owner</span>}
              {member.status === 'REMOVED' && <span className="text-sm text-slate-500">Requires a new invitation</span>}
            </div></td>
          </tr>)}</tbody>
        </table>{shownMembers.length === 0 && <p className="p-8 text-center text-base text-slate-500">No members match this filter.</p>}</div>}
      {canInvite && <div className="border-t border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Invitations</h3><div className="flex items-center gap-2">
          <label htmlFor="enterprise-invitation-filter" className="text-base text-slate-600">Invitation status</label>
          <select id="enterprise-invitation-filter" value={invitationStatus} disabled={isLoading || busy} onChange={(event) => onInvitationStatusChange(event.target.value)} className="rounded-[8px] border border-slate-300 bg-white px-3 py-2 text-base text-slate-900">
            {['PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED'].map((status) => <option key={status} value={status}>{label(status)}</option>)}
          </select>
        </div></div>
        {!isLoading && invitations.length === 0 && <p className="mt-4 text-base text-slate-500">No {invitationStatus.toLowerCase()} invitations.</p>}
        {!isLoading && <ul className="mt-4 space-y-2">{invitations.map((invitation) => <li key={invitation.invitationId} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-slate-200 p-3">
          <div><p className="text-base font-medium text-slate-900">{invitation.invitedUserDisplayName || invitation.invitedUserEmail}</p><p className="text-sm text-slate-500">{invitation.invitedUserEmail} · {label(invitation.role)} · {label(invitation.status)}</p></div>
          {canRevokeEnterpriseInvitation(account.role, invitation) && <Button className="rounded-[8px]" size="sm" variant="outline" disabled={busy} onClick={() => openAction('revoke', invitation)}>Revoke</Button>}
        </li>)}</ul>}
      </div>}
      <Dialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open && !busy) setPendingAction(null); }}>
        <DialogContent className="max-w-lg rounded-[8px] bg-white p-6 text-slate-900 shadow-xl">
          <DialogHeader><DialogTitle>{actionTitle}</DialogTitle><DialogDescription>{actionDescription}</DialogDescription></DialogHeader>
          {pendingAction?.kind === 'role' && <div className="mt-5 space-y-2"><label htmlFor="enterprise-member-role" className="text-base font-medium">New role</label><select id="enterprise-member-role" value={requestedRole} disabled={busy} onChange={(event) => setRequestedRole(event.target.value)} className={inputClass}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></div>}
          <DialogFooter className="mt-6 gap-2"><Button className="rounded-[8px]" variant="outline" disabled={busy} onClick={() => setPendingAction(null)}>Cancel</Button><Button disabled={busy || isLoading || !account || pendingAction?.kind === 'role' && requestedRole === pendingAction.target.role} onClick={confirmAction} className="rounded-[8px] bg-violet-700 text-white hover:bg-violet-800">{busy ? 'Saving…' : 'Confirm'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default EnterpriseTeamManagement;
