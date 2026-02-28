import React, { useState } from 'react';
import Sidebar from '@/components/navigation/Sidebar';
import MobileTopBar from '@/components/navigation/MobileTopBar';
import AppHeader from '@/components/navigation/AppHeader';
import EmulatorHealthBanner from '@/components/app/EmulatorHealthBanner';
import EmailVerificationNotice from '@/components/app/EmailVerificationNotice';

const AppShell = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
        <AppHeader />
        <EmailVerificationNotice />
        <EmulatorHealthBanner />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;


