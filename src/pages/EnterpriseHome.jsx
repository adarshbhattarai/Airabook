import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ChevronDown,
  Eye,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  MoreVertical,
  Search,
  Settings,
  ShieldCheck,
  Share2,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';

const navigation = [
  { label: 'Management Studio', detail: 'Enterprise Admin', icon: LayoutDashboard },
  { label: 'Upload Assets', icon: Upload },
  { label: 'Knowledge Base', icon: BookOpen },
  { label: 'Assets', icon: ImageIcon },
  { label: 'Shared with Me', icon: Share2 },
  { label: 'Customer View', icon: Eye },
  { label: 'Administration', icon: ShieldCheck },
];

const teamMembers = [
  { name: 'Sarah Jenkins', email: 'sarah@enterprise.com', role: 'Admin', status: 'Active', lastActive: 'Just now', avatar: 'bg-amber-200' },
  { name: 'Michael Chen', email: 'michael@enterprise.com', role: 'Member', status: 'Active', lastActive: '2 hours ago', avatar: 'bg-sky-200' },
  { name: 'Elena Rodriguez', email: 'elena@enterprise.com', role: 'Member', status: 'Offline', lastActive: '1 day ago', avatar: 'bg-indigo-200' },
];

const EnterpriseHome = () => {
  const [activeNav, setActiveNav] = useState('Administration');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleNavigation = (label) => {
    setActiveNav(label);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#fafaff] text-slate-900">
      <div className="flex min-h-screen">
        <EnterpriseSidebar activeNav={activeNav} mobileOpen={mobileNavOpen} onNavigate={handleNavigation} onClose={() => setMobileNavOpen(false)} />

        <div className="min-w-0 flex-1">
          <EnterpriseHeader onMenu={() => setMobileNavOpen(true)} />
          <main className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 sm:py-9 xl:px-12">
            <div className="mb-7">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Management Studio · Enterprise</p>
              <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Organization Overview</h1><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">All systems operational</span></div>
              <p className="mt-2 text-sm text-slate-500">Manage your workspace, teams, and account health from one place.</p>
            </div>

            <section className="grid gap-4 md:grid-cols-3" aria-label="Organization metrics">
              <OverviewCard label="Total Users" value="1,248" detail="12% this month" trend="up" icon={Users} iconClass="bg-violet-100 text-violet-700" />
              <OverviewCard label="Knowledge Base Size" value="4.2 TB" detail="15,420 Assets" icon={BookOpen} iconClass="bg-indigo-100 text-indigo-700" />
              <OverviewCard label="Active Customer Workspaces" value="86" detail="All systems operational" icon={Building2} iconClass="bg-sky-100 text-sky-700" />
            </section>

            <TeamManagement />
          </main>
        </div>
      </div>
    </div>
  );
};

const EnterpriseSidebar = ({ activeNav, mobileOpen, onNavigate, onClose }) => (
  <>
    {mobileOpen && <button type="button" aria-label="Close navigation" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/25 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[238px] shrink-0 flex-col border-r border-violet-100 bg-[#f1f0ff] transition-transform duration-200 lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[74px] items-center justify-between border-b border-violet-100 px-5">
        <Link to="/v2/enterprise-home" className="flex items-center gap-2 text-lg font-bold tracking-[-0.03em] text-violet-700">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-700 text-white"><Building2 className="h-4 w-4" /></span>
          Airabook <span className="font-semibold text-slate-800">Enterprise</span>
        </Link>
        <button type="button" aria-label="Close navigation" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 lg:hidden"><X className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {navigation.map(({ label, detail, icon: Icon }) => {
          const active = activeNav === label;
          return (
            <button key={label} type="button" onClick={() => onNavigate(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${active ? 'bg-violet-700 text-white shadow-md shadow-violet-700/15' : 'text-slate-600 hover:bg-white/75 hover:text-violet-700'}`}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{label}</span>{detail && <span className={`block truncate text-[9px] ${active ? 'text-violet-100' : 'text-slate-400'}`}>{detail}</span>}</span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-violet-100 px-3 py-5">
        <button type="button" onClick={() => onNavigate('Settings')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-white/75 hover:text-violet-700"><Settings className="h-4 w-4" />Settings</button>
        <button type="button" onClick={() => onNavigate('Support')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-600 transition hover:bg-white/75 hover:text-violet-700"><HelpCircle className="h-4 w-4" />Support</button>
      </div>
    </aside>
  </>
);

const EnterpriseHeader = ({ onMenu }) => (
  <header className="flex h-[74px] items-center justify-between border-b border-violet-100 bg-white/80 px-5 backdrop-blur sm:px-8 xl:px-12">
    <button type="button" aria-label="Open navigation" onClick={onMenu} className="mr-3 rounded-lg p-2 text-slate-500 hover:bg-violet-50 lg:hidden"><Menu className="h-5 w-5" /></button>
    <div className="relative hidden w-full max-w-[300px] sm:block"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><input aria-label="Search enterprise workspace" placeholder="Search..." className="h-9 w-full rounded-full border-0 bg-[#e9eaff] pl-9 pr-4 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-violet-200" /></div>
    <div className="ml-auto flex items-center gap-2 sm:gap-4">
      <button type="button" className="hidden items-center gap-2 rounded-full bg-violet-700 px-4 py-2 text-[10px] font-bold text-white shadow-sm transition hover:bg-violet-800 sm:flex"><Building2 className="h-3 w-3" />Workspace <ChevronDown className="h-3 w-3" /></button>
      <button type="button" aria-label="Notifications" className="rounded-lg p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700"><Bell className="h-4 w-4" /></button>
      <button type="button" aria-label="Usage" className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700 sm:block"><BarChart3 className="h-4 w-4" /></button>
      <button type="button" aria-label="Help" className="hidden rounded-lg p-2 text-slate-500 transition hover:bg-violet-50 hover:text-violet-700 sm:block"><HelpCircle className="h-4 w-4" /></button>
      <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-200 text-slate-600 shadow-sm"><User className="h-4 w-4" /></span>
    </div>
  </header>
);

const OverviewCard = ({ label, value, detail, trend, icon: Icon, iconClass }) => (
  <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_26px_rgba(99,91,255,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(99,91,255,0.10)]">
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-slate-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-full ${iconClass}`}><Icon className="h-4 w-4" /></span></div>
    <p className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-900">{value}</p>
    <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-500">{trend === 'up' && <ArrowUpRight className="h-3 w-3 text-violet-600" />}{trend === 'up' ? '+' : ''}{detail}</p>
  </article>
);

const TeamManagement = () => (
  <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_26px_rgba(99,91,255,0.06)]">
    <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><h2 className="text-base font-semibold tracking-[-0.02em] text-slate-900">Team Management</h2><p className="mt-1 text-xs text-slate-400">Manage members and workspace access.</p></div><button type="button" className="flex items-center gap-2 rounded-lg bg-[#e2e5ff] px-3 py-2 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100"><Users className="h-3.5 w-3.5" />Add Member</button></div>
    <div className="hidden grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_32px] gap-4 border-b border-slate-100 bg-[#fbfaff] px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:grid sm:px-6"><span>Member</span><span>Role</span><span>Status</span><span>Last active</span><span /></div>
    <div>{teamMembers.map((member) => <TeamMemberRow key={member.email} member={member} />)}</div>
  </section>
);

const TeamMemberRow = ({ member }) => (
  <div className="relative grid gap-3 border-b border-slate-100 px-5 py-4 last:border-0 sm:grid-cols-[1.6fr_0.7fr_0.7fr_0.8fr_32px] sm:items-center sm:gap-4 sm:px-6">
    <div className="flex items-center gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${member.avatar} text-slate-600`}><User className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{member.name}</p><p className="truncate text-[10px] text-slate-400">{member.email}</p></div></div>
    <div className="flex items-center justify-between sm:block"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Role</span><span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold ${member.role === 'Admin' ? 'bg-violet-100 text-violet-700' : 'bg-[#e5e8ff] text-slate-500'}`}>{member.role}</span></div>
    <div className="flex items-center justify-between sm:block"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Status</span><span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600"><span className={`h-1.5 w-1.5 rounded-full ${member.status === 'Active' ? 'bg-violet-600' : 'bg-slate-400'}`} />{member.status}</span></div>
    <div className="flex items-center justify-between sm:block"><span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Last active</span><span className="text-[10px] text-slate-500">{member.lastActive}</span></div>
    <button type="button" aria-label={`Actions for ${member.name}`} className="absolute right-5 top-4 text-slate-400 hover:text-violet-700 sm:static"><MoreVertical className="h-4 w-4" /></button>
  </div>
);

export default EnterpriseHome;
