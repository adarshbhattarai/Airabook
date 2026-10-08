import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Eye,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Share2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import EnterpriseTeamManagement from '@/components/workspace/EnterpriseTeamManagement';
import { WorkspaceProfileMenu, WorkspaceSwitcher } from '@/components/workspace/WorkspaceMenu';
import { useAuth } from '@/context/AuthContext';
import {
  getEnterpriseAccountInvitations,
  getCurrentEnterpriseUser,
  getEnterpriseMembers,
} from '@/services/enterpriseOnboardingService';
import { clearPreferredWorkspaceId, getActiveWorkspaces, getPreferredWorkspaceId, savePreferredWorkspaceId, WORKSPACE_CHOOSER_PATH } from '@/services/workspaceSelection';

const navigation = [
  { label: 'Management Studio', detail: 'Enterprise Admin', icon: LayoutDashboard },
  { label: 'Upload Assets', icon: Upload },
  { label: 'Knowledge Base', icon: BookOpen },
  { label: 'Assets', icon: ImageIcon },
  { label: 'Shared with Me', icon: Share2 },
  { label: 'Customer View', icon: Eye },
  { label: 'Administration', icon: ShieldCheck },
];

const formatRole = (role) => {
  if (!role) return '—';
  return role.charAt(0) + role.slice(1).toLowerCase();
};

const EnterpriseHome = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user: firebaseUser } = useAuth();
  const [activeNav, setActiveNav] = useState('Administration');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [workspace, setWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [invitationStatus, setInvitationStatus] = useState('PENDING');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestedAccountId = new URLSearchParams(location.search).get('accountId') || location.state?.account?.id;

  useEffect(() => {
    let isCurrent = true;

    const loadWorkspace = async () => {
        setIsLoading(true);
        setLoadError('');
        setWorkspace(null);
        setMembers([]);
        setInvitations([]);
      try {
        const currentUser = await getCurrentEnterpriseUser();
        const enterpriseAccounts = getActiveWorkspaces(currentUser)
          .filter((account) => account.type === 'ENTERPRISE');
        const preferredAccountId = getPreferredWorkspaceId(firebaseUser?.uid);
        const requestedIds = (requestedAccountId ? [requestedAccountId] : [preferredAccountId]).filter(Boolean);
        let selectedAccount = requestedIds
          .map((id) => enterpriseAccounts.find((account) => String(account.id) === String(id)))
          .find(Boolean);

        if (!selectedAccount && preferredAccountId) clearPreferredWorkspaceId(firebaseUser?.uid);
        if (!selectedAccount && !requestedAccountId && enterpriseAccounts.length === 1) selectedAccount = enterpriseAccounts[0];

        if (!selectedAccount) {
          if (isCurrent) navigate(WORKSPACE_CHOOSER_PATH, { replace: true });
          return;
        }

        // Local storage is only a preference. /me provides the current memberships,
        // and the API rechecks access for the selected account on every request.
        savePreferredWorkspaceId(firebaseUser?.uid, selectedAccount.id);
        const accountMembers = await getEnterpriseMembers(selectedAccount.id);
        const accountInvitations = ['OWNER', 'ADMIN'].includes(selectedAccount.role)
          ? await getEnterpriseAccountInvitations(selectedAccount.id, invitationStatus)
          : [];
        if (isCurrent) {
          setWorkspace({ user: currentUser.user, account: selectedAccount });
          setMembers(accountMembers);
          setInvitations(accountInvitations || []);
        }
      } catch (error) {
        console.error('Unable to load Enterprise workspace', error);
        if (isCurrent) {
          setWorkspace(null);
          setMembers([]);
          setInvitations([]);
          setLoadError(error.message || 'Unable to load this workspace.');
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadWorkspace();
    return () => {
      isCurrent = false;
    };
  }, [firebaseUser?.uid, requestedAccountId, navigate, refreshVersion, invitationStatus]);

  const handleNavigation = (label) => {
    setActiveNav(label);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaff] text-slate-900">
      <div className="flex min-h-screen">
        <EnterpriseSidebar account={workspace?.account} activeNav={activeNav} mobileOpen={mobileNavOpen} onNavigate={handleNavigation} onClose={() => setMobileNavOpen(false)} />

        <div className="min-w-0 flex-1">
          <EnterpriseHeader workspace={workspace?.account} onMenu={() => setMobileNavOpen(true)} />
          <main className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9 xl:px-12">
            <div className="mb-7">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-violet-600">Management Studio · Enterprise</p>
              <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Organization Overview</h1><span className="rounded-[8px] bg-emerald-50 px-2.5 py-1 text-sm font-semibold text-emerald-700">All systems operational</span></div>
              <p className="mt-2 text-base text-slate-500">{workspace?.account?.name || 'Loading workspace…'} · Manage your team and account access.</p>
            </div>

            {loadError && <div role="alert" className="mb-6 rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-700">{loadError}</div>}

            <section className="grid gap-4 md:grid-cols-3" aria-label="Organization metrics">
              <OverviewCard label="Team members" value={isLoading ? '…' : members.filter((member) => member.status === 'ACTIVE').length} detail="Active memberships" icon={Users} iconClass="bg-violet-100 text-violet-700" />
              <OverviewCard label="Workspace" value={workspace?.account?.slug || '…'} detail={workspace?.account?.accountStatus || 'Loading'} icon={Building2} iconClass="bg-indigo-100 text-indigo-700" />
              <OverviewCard label="Your role" value={formatRole(workspace?.account?.role)} detail="Workspace access" icon={ShieldCheck} iconClass="bg-sky-100 text-sky-700" />
            </section>

            <EnterpriseTeamManagement
              account={workspace?.account}
              actorUserId={workspace?.user?.id}
              members={members}
              invitations={invitations}
              isLoading={isLoading}
              invitationStatus={invitationStatus}
              onInvitationStatusChange={setInvitationStatus}
              onRefresh={() => setRefreshVersion((version) => version + 1)}
            />
          </main>
        </div>
      </div>
    </div>
  );
};

const EnterpriseSidebar = ({ account, activeNav, mobileOpen, onNavigate, onClose }) => (
  <>
    {mobileOpen && <button type="button" aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/25 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[238px] shrink-0 flex-col border-r border-violet-100 bg-[#f1f0ff] transition-transform duration-200 lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[74px] items-center justify-between border-b border-violet-100 px-5">
        <Link to="/v2/enterprise-home" className="flex items-center gap-2 text-lg font-bold tracking-[-0.03em] text-violet-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-violet-700 text-white"><Building2 className="h-4 w-4" /></span>
          Airabook <span className="font-semibold text-slate-800">Enterprise</span>
        </Link>
        <button type="button" aria-label="Close navigation" onClick={onClose} className="rounded-[8px] p-1 text-slate-400 hover:bg-white hover:text-slate-700 lg:hidden"><X className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navigation.map(({ label, detail, icon: Icon }) => {
          const active = activeNav === label;
          return (
            <button key={label} type="button" onClick={() => onNavigate(label)} className={`flex w-full items-center gap-3 min-h-11 rounded-[8px] px-3 py-2.5 text-left transition ${active ? 'bg-violet-700 text-white shadow-md shadow-violet-700/15' : 'text-slate-600 hover:bg-white/75 hover:text-violet-700'}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{label}</span>{detail && <span className={`block truncate text-sm ${active ? 'text-violet-100' : 'text-slate-400'}`}>{detail}</span>}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-violet-100 px-3 py-5">
        <WorkspaceSwitcher mode="enterprise" account={account} onSelected={onClose}>
          <button type="button" className="flex w-full items-center gap-3 min-h-11 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-violet-700 transition hover:bg-white/75"><Building2 className="h-4 w-4" />Switch workspace</button>
        </WorkspaceSwitcher>
        <button type="button" onClick={() => onNavigate('Settings')} className="flex w-full items-center gap-3 min-h-11 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-white/75 hover:text-violet-700"><Settings className="h-4 w-4" />Settings</button>
        <button type="button" onClick={() => onNavigate('Support')} className="flex w-full items-center gap-3 min-h-11 rounded-[8px] px-3 py-2.5 text-left text-sm font-semibold text-slate-600 transition hover:bg-white/75 hover:text-violet-700"><HelpCircle className="h-4 w-4" />Support</button>
      </div>
    </aside>
  </>
);

const EnterpriseHeader = ({ workspace, onMenu }) => (
  <header className="flex h-[74px] items-center justify-between border-b border-violet-100 bg-white/80 px-5 backdrop-blur sm:px-8 xl:px-12">
    <button type="button" aria-label="Open navigation" onClick={onMenu} className="mr-3 rounded-[8px] p-2 text-slate-500 hover:bg-violet-50 lg:hidden"><Menu className="h-5 w-5" /></button>
    <div className="relative hidden w-full max-w-[300px] sm:block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Search enterprise workspace" placeholder="Search..." className="h-11 w-full rounded-[8px] border-0 bg-[#e9eaff] pl-9 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-violet-200" /></div>
    <div className="ml-auto flex items-center gap-2 sm:gap-4">
      <button type="button" aria-label="Notifications" className="min-h-11 min-w-11 rounded-[8px] p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700"><Bell className="h-4 w-4" /></button>
      <button type="button" aria-label="Usage" className="hidden min-h-11 min-w-11 rounded-[8px] p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700 sm:block"><BarChart3 className="h-4 w-4" /></button>
      <button type="button" aria-label="Help" className="hidden rounded-[8px] p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700 sm:block"><HelpCircle className="h-4 w-4" /></button>
      <WorkspaceProfileMenu mode="enterprise" account={workspace} />
    </div>
  </header>
);

const OverviewCard = ({ label, value, detail, trend, icon: Icon, iconClass }) => (
  <article className="rounded-[8px] border border-slate-200/80 bg-white p-5 shadow-[0_8px_26px_rgba(99,91,255,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(99,91,255,0.10)]">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-[8px] ${iconClass}`}><Icon className="h-4 w-4" /></span></div>
    <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-900">{value}</p>
    <p className="mt-2 flex items-center gap-1 text-sm text-slate-500">{trend === 'up' && <ArrowUpRight className="h-3 w-3 text-violet-600" />}{trend === 'up' ? '+' : ''}{detail}</p>
  </article>
);

export default EnterpriseHome;
