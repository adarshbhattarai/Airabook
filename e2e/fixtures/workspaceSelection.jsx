// Test-only entry point; renders production App/routes with mocked identity and APIs.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/index.css';

const { initialRoute = '/v2/personal-login', from } = window.workspaceFixture || {};
window.history.replaceState({ usr: from ? { from } : null, key: 'fixture', idx: 0 }, '', initialRoute);
createRoot(document.getElementById('root')).render(<App />);
