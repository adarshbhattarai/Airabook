import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Building2, Menu, ShieldCheck, Users, X } from 'lucide-react';
import { WorkspaceProfileMenu, WorkspaceSwitcher } from '@/components/workspace/WorkspaceMenu';

const AdminShell = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900" data-testid="admin-shell">
      {open && <button aria-label="Close admin navigation" type="button" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/30 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-indigo-100 bg-[#edf0ff] lg:sticky lg:top-0 lg:flex lg:h-screen ${open ? 'flex' : 'hidden'}`}>
        <div className="flex h-[74px] items-center justify-between px-5">
          <Link to="/admin/enterprise-approvals" className="flex items-center gap-2 font-semibold text-indigo-800"><ShieldCheck className="h-6 w-6" />Airabook Admin</Link>
          <button type="button" aria-label="Close admin navigation" onClick={() => setOpen(false)} className="p-2 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav aria-label="Platform administration" className="flex-1 space-y-2 px-3 py-5">
          {[{ to: '/admin/enterprise-approvals', label: 'Enterprise requests', icon: Building2 }, { to: '/admin', label: 'Users & resources', icon: Users }].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 min-h-11 rounded-[8px] px-3 py-3 text-base font-medium ${isActive ? 'bg-indigo-700 text-white' : 'text-indigo-950 hover:bg-white/70'}`}><Icon className="h-4 w-4" />{label}</NavLink>
          ))}
        </nav>
        <div className="space-y-2 border-t border-indigo-100 p-4">
          <WorkspaceSwitcher mode="admin" onSelected={() => setOpen(false)}>
            <button type="button" className="flex w-full items-center gap-3 min-h-11 rounded-[8px] px-3 py-2 text-base text-indigo-800 hover:bg-white"><Building2 className="h-4 w-4" />Switch workspace</button>
          </WorkspaceSwitcher>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-[74px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 sm:px-8">
          <button type="button" aria-label="Open admin navigation" onClick={() => setOpen(true)} className="rounded-[8px] p-2 lg:hidden"><Menu className="h-5 w-5" /></button>
          <div><p className="text-base font-semibold">Platform administration</p><p className="text-sm text-slate-500">System Admin</p></div>
          <div className="ml-auto"><WorkspaceProfileMenu mode="admin" /></div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default AdminShell;
