import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Building2, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getCurrentEnterpriseUser } from '@/services/enterpriseOnboardingService';
import {
  getActiveWorkspaces, getSafeReturnLocation, getSelectedWorkspaceDestination,
  getWorkspaceLandingPath, hasSystemAdminDestination, savePreferredWorkspaceId,
} from '@/services/workspaceSelection';

const WorkspaceChooser = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setProfile(null);
    setError('');
    getCurrentEnterpriseUser().then((me) => {
      if (!current) return;
      if (getWorkspaceLandingPath(me) === '/dashboard') {
        const personal = getActiveWorkspaces(me)[0];
        savePreferredWorkspaceId(user?.uid, personal.id);
        navigate(getSelectedWorkspaceDestination(personal, from), { replace: true });
      } else setProfile(me);
    }).catch((loadError) => {
      if (current) setError(loadError.message || 'Unable to load your workspaces. Please try again.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.uid, navigate, from, retry]);

  const selectDestination = async (account) => {
    setSelecting(account?.id || 'admin');
    setError('');
    try {
      // Revalidate when choosing: membership or the system role may have changed.
      const me = await getCurrentEnterpriseUser();
      setProfile(me);
      if (!account) {
        if (!hasSystemAdminDestination(me)) throw new Error('Your System Admin access is no longer available.');
        const safe = getSafeReturnLocation(from);
        navigate(safe && (safe.pathname === '/admin' || safe.pathname.startsWith('/admin/'))
          ? safe : '/admin/enterprise-approvals', { replace: true });
        return;
      }
      const authorized = getActiveWorkspaces(me).find((item) => String(item.id) === String(account.id));
      if (!authorized) throw new Error('This workspace is no longer available. Please choose another.');
      savePreferredWorkspaceId(user?.uid, authorized.id);
      navigate(getSelectedWorkspaceDestination(authorized, from), { replace: true, state: { account: authorized } });
    } catch (selectionError) {
      setError(selectionError.message || 'Unable to open this workspace. Please try again.');
    } finally { setSelecting(null); }
  };

  const signOut = async () => {
    setSelecting('logout');
    try { await logout(); navigate('/v2/personal-login', { replace: true }); }
    catch (logoutError) { setError(logoutError.message || 'Unable to sign out.'); }
    finally { setSelecting(null); }
  };

  const accounts = getActiveWorkspaces(profile);
  const ordered = [...accounts.filter((account) => account.type === 'ENTERPRISE'),
    ...accounts.filter((account) => account.type === 'PERSONAL')];
  const initials = (user?.displayName || user?.email || 'You').trim().slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#212121] px-6 pb-12 pt-[15vh] text-[#f4f4f4]" data-testid="workspace-chooser">
      <Helmet><title>Choose a workspace | Airabook</title></Helmet>
      <section className="mx-auto w-full max-w-[380px]" aria-labelledby="workspace-heading">
        <h1 id="workspace-heading" className="mb-10 text-center text-[30px] font-medium tracking-[-0.025em]">Choose a workspace</h1>
        {loading && <p role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-gray-300"><Loader2 className="h-5 w-5 animate-spin" />Loading your workspaces…</p>}
        {error && <div role="alert" className="mb-5 rounded-[8px] border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-200">{error}<button type="button" onClick={() => setRetry((value) => value + 1)} disabled={!!selecting} className="mt-3 block underline underline-offset-4">Try again</button></div>}
        {!loading && profile && <>
          <div className="divide-y divide-white/10" aria-label="Available destinations">
            {ordered.map((account) => <DestinationRow key={account.id} label={account.type === 'PERSONAL' ? 'Personal account' : account.name}
              disabled={!!selecting} busy={selecting === account.id} onClick={() => selectDestination(account)}
              avatar={account.type === 'PERSONAL' ? <span className="bg-[#c783ce]">{initials}</span> : <span className="bg-[#68cde0]"><Building2 className="h-5 w-5" /></span>} />)}
            {hasSystemAdminDestination(profile) && <DestinationRow label="Admin dashboard" disabled={!!selecting} busy={selecting === 'admin'}
              onClick={() => selectDestination(null)} avatar={<span className="bg-[#7773d4]"><ShieldCheck className="h-5 w-5" /></span>} />}
          </div>
          {ordered.length === 0 && !hasSystemAdminDestination(profile) && <p className="py-6 text-center text-sm text-gray-300">No active workspaces are available. Check your invitations or contact your workspace administrator.</p>}
        </>}
        <footer className="mt-9 flex flex-col items-center gap-4 text-xs text-gray-400">
          <Link to="/v2/workspaces" className="underline underline-offset-4 hover:text-white">Invitations &amp; requests</Link>
          <p className="max-w-full truncate">{user?.email}</p>
          <button type="button" onClick={signOut} disabled={!!selecting} className="rounded-[8px] px-2 py-1 underline underline-offset-4 hover:text-white disabled:opacity-50">Sign out</button>
        </footer>
      </section>
    </div>
  );
};

const DestinationRow = ({ label, avatar, onClick, disabled, busy }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-busy={busy}
    className="flex w-full items-center gap-4 rounded-[8px] px-5 py-6 text-left transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#68cde0] disabled:opacity-60">
    <span aria-hidden="true" className="[&>span]:flex [&>span]:h-10 [&>span]:w-10 [&>span]:items-center [&>span]:justify-center [&>span]:rounded-full [&>span]:text-xs [&>span]:font-medium [&>span]:text-white">{avatar}</span>
    <span className="min-w-0 flex-1 break-words text-[15px]">{label}</span>
    {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-gray-400" /> : <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-gray-400" />}
  </button>
);

export default WorkspaceChooser;
