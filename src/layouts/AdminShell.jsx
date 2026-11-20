import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from '@/components/navigation/Sidebar';
import { WorkspaceProfileMenu } from '@/components/workspace/WorkspaceMenu';

const AdminShell = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-screen bg-background text-foreground" data-testid="admin-shell">
      <Sidebar mode="admin" open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[74px] shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 sm:px-8">
          <button type="button" aria-label="Open admin navigation" onClick={() => setOpen(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-appSoft md:hidden"><Menu className="h-4 w-4" /></button>
          <div><p className="text-base font-semibold">Platform administration</p><p className="text-sm text-muted-foreground">System Admin</p></div>
          <div className="ml-auto"><WorkspaceProfileMenu mode="admin" /></div>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
};

export default AdminShell;
