import React, { useState } from 'react';
import Sidebar from '@/components/navigation/Sidebar';
import MobileTopBar from '@/components/navigation/MobileTopBar';
import AppHeader from '@/components/navigation/AppHeader';

const AppShell = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-app-gray-50 text-foreground">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileTopBar onMenuClick={() => setSidebarOpen(true)} />
        <AppHeader />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;


