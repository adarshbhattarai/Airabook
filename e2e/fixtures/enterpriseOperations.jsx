// Test-only entry point; production routes use the existing AdminShell.
import React from 'react';
import { createRoot } from 'react-dom/client';
import EnterpriseApprovals from '@/pages/admin/EnterpriseApprovals';
import { Toaster } from '@/components/ui/toaster';
import '@/index.css';
createRoot(document.getElementById('root')).render(<><EnterpriseApprovals /><Toaster /></>);
