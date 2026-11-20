// Test-only entry point: included in the Vite dev server, never in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AppQueryProvider from '@/context/AppQueryProvider';
import { WorkspaceProvider } from '@/context/WorkspaceContext';
import EnterpriseHome from '@/pages/EnterpriseHome';
import EnterpriseWorkspaceHub from '@/pages/EnterpriseWorkspaceHub';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';

const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')).render(
  <MemoryRouter initialEntries={[view === 'inbox' ? '/v2/workspaces' : '/v2/enterprise-home/administration']}><AppQueryProvider>
    {view === 'inbox' ? <EnterpriseWorkspaceHub /> : <WorkspaceProvider><EnterpriseHome /></WorkspaceProvider>}
    <Toaster />
  </AppQueryProvider></MemoryRouter>
);
