// Test-only entry point: included in the Vite dev server, never in the production build.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import EnterpriseHome from '@/pages/EnterpriseHome';
import EnterpriseWorkspaceHub from '@/pages/EnterpriseWorkspaceHub';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';

const view = new URLSearchParams(window.location.search).get('view');
createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    {view === 'inbox' ? <EnterpriseWorkspaceHub /> : <EnterpriseHome />}
    <Toaster />
  </MemoryRouter>
);
