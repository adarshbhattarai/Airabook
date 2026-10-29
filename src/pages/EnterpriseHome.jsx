import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WorkspaceBadge, WorkspaceNotice } from '@/components/workspace/WorkspaceUI';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Eye,
  Globe2,
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
import EnterpriseApiKeyDialog from '@/components/workspace/EnterpriseApiKeyDialog';
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
  const websiteUrl = getWebsiteUrl(workspace?.account?.website);

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
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <EnterpriseSidebar account={workspace?.account} activeNav={activeNav} mobileOpen={mobileNavOpen} onNavigate={handleNavigation} onClose={() => setMobileNavOpen(false)} />

        <div className="min-w-0 flex-1">
          <EnterpriseHeader workspace={workspace?.account} onMenu={() => setMobileNavOpen(true)} />
          <main className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9 xl:px-12">
            <div className="mb-7 flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
              <div className="w-full min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Management Studio · Enterprise</p>
              <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">Organization Overview</h1><WorkspaceBadge status="ACTIVE">All systems operational</WorkspaceBadge></div>
              <p className="mt-2 text-base text-muted-foreground">{workspace?.account?.name || 'Loading workspace…'} · Manage your team and account access.</p>
              {websiteUrl && <div className="mt-2 flex items-start gap-2 text-sm">
                <Globe2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">Website:</span>
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-primary underline-offset-4 hover:underline focus-visible:underline">
                  {workspace.account.website.trim()}<ArrowUpRight aria-hidden="true" className="ml-1 inline h-3.5 w-3.5" />
                </a>
              </div>}
              </div>
              {workspace && (workspace.account.role === 'OWNER' || workspace.user.systemRole === 'SYSTEM_ADMIN')
                && <EnterpriseApiKeyDialog key={`${workspace.account.id}:${workspace.account.role}:${workspace.user.systemRole}`} account={workspace.account} />}
            </div>

            {loadError && <WorkspaceNotice role="alert" tone="danger" className="mb-6">{loadError}</WorkspaceNotice>}

            <section className="grid gap-4 md:grid-cols-3" aria-label="Organization metrics">
              <OverviewCard label="Team members" value={isLoading ? '…' : members.filter((member) => member.status === 'ACTIVE').length} detail="Active memberships" icon={Users} iconClass="bg-primary/10 text-primary" />
              <OverviewCard label="Workspace" value={workspace?.account?.slug || '…'} detail={workspace?.account?.accountStatus || 'Loading'} icon={Building2} iconClass="bg-primary/10 text-primary" />
              <OverviewCard label="Your role" value={formatRole(workspace?.account?.role)} detail="Workspace access" icon={ShieldCheck} iconClass="bg-primary/10 text-primary" />
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
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[238px] shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[74px] items-center justify-between border-b border-border px-5">
        <Link to="/v2/enterprise-home" className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Building2 className="h-5 w-5" /></span>
          <span className="min-w-0"><span className="block truncate text-base font-semibold text-foreground">Airabook</span><span className="block truncate text-xs text-muted-foreground">Enterprise</span></span>
        </Link>
        <button type="button" aria-label="Close navigation" onClick={onClose} className="shrink-0 rounded-[4px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"><X className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navigation.map(({ label, detail, icon: Icon }) => {
          const active = activeNav === label;
          return (
            <button key={label} type="button" onClick={() => onNavigate(label)} className={`flex w-full items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-primary'}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{label}</span>{detail && <span className={`block truncate text-sm ${active ? 'text-primary' : 'text-muted-foreground'}`}>{detail}</span>}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border px-3 py-5">
        <WorkspaceSwitcher mode="enterprise" account={account} onSelected={onClose}>
          <button type="button" className="flex w-full items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary transition hover:bg-accent"><Building2 className="h-4 w-4" />Switch workspace</button>
        </WorkspaceSwitcher>
        <button type="button" onClick={() => onNavigate('Settings')} className="flex w-full items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-primary"><Settings className="h-4 w-4" />Settings</button>
        <button type="button" onClick={() => onNavigate('Support')} className="flex w-full items-center gap-3 min-h-11 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-primary"><HelpCircle className="h-4 w-4" />Support</button>
      </div>
    </aside>
  </>
);

const EnterpriseHeader = ({ workspace, onMenu }) => (
  <header className="flex h-[74px] items-center justify-between border-b border-border bg-card/80 px-5 backdrop-blur sm:px-8 xl:px-12">
    <Button type="button" variant="ghost" size="icon" aria-label="Open navigation" onClick={onMenu} className="mr-3 lg:hidden"><Menu className="h-5 w-5" /></Button>
    <div className="relative hidden w-full max-w-[300px] sm:block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search enterprise workspace" placeholder="Search..." className="bg-muted/50 pl-9 text-sm text-foreground" /></div>
    <div className="ml-auto flex items-center gap-2 sm:gap-4">
      <Button type="button" variant="ghost" size="icon" aria-label="Notifications"><Bell className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Usage" className="hidden sm:inline-flex"><BarChart3 className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="icon" aria-label="Help" className="hidden sm:inline-flex"><HelpCircle className="h-4 w-4" /></Button>
      <WorkspaceProfileMenu mode="enterprise" account={workspace} />
    </div>
  </header>
);

const OverviewCard = ({ label, value, detail, trend, icon: Icon, iconClass }) => (
  <Card as="article" className="p-5">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-muted-foreground">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}><Icon className="h-4 w-4" /></span></div>
    <p className="mt-4 break-words text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">{trend === 'up' && <ArrowUpRight className="h-3 w-3 text-primary" />}{trend === 'up' ? '+' : ''}{detail}</p>
  </Card>
);

export default EnterpriseHome;
