import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '@/components/navigation/Sidebar';
import MobileTopBar from '@/components/navigation/MobileTopBar';
import AppHeader from '@/components/navigation/AppHeader';
import EmulatorHealthBanner from '@/components/app/EmulatorHealthBanner';
import EmailVerificationNotice from '@/components/app/EmailVerificationNotice';
import { WorkspaceProvider, useWorkspace } from '@/context/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { WorkspaceNotice } from '@/components/workspace/WorkspaceUI';

const SharedAppShell = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const workspace = useWorkspace();
  const { pathname } = useLocation();
  const isAdministration = pathname === '/v2/enterprise-home/administration';

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
        <AppHeader />
        <EmailVerificationNotice />
        <EmulatorHealthBanner />
        <main className="flex-1 overflow-y-auto">
          {workspace.error && <div className="p-6"><WorkspaceNotice role="alert" tone="danger">{workspace.error}</WorkspaceNotice><Button variant="outline" className="mt-4" onClick={workspace.retry}>Retry workspace access</Button></div>}
          {isAdministration
            ? workspace.loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading administration…</p>
              : !workspace.error && children
            : children}
        </main>
      </div>
    </div>
  );
};

const AppShell = ({ children }) => <WorkspaceProvider><SharedAppShell>{children}</SharedAppShell></WorkspaceProvider>;

export default AppShell;


