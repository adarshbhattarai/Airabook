import React from 'react';
import AuthBrandPanel from './AuthBrandPanel';

const AuthShell = ({ children, enterprise = false, wide = false }) => (
  <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_#ede9fe,_transparent_35%),linear-gradient(135deg,_#f8fafc,_#f5f3ff)] p-0 text-slate-950 sm:p-4 lg:p-6">
    <div className="mx-auto flex min-h-screen max-w-[1480px] overflow-visible border border-white/80 bg-white/95 shadow-[0_24px_80px_rgba(55,48,163,0.14)] sm:min-h-[calc(100vh-2rem)] sm:rounded-2xl lg:min-h-[calc(100vh-3rem)]">
      <AuthBrandPanel enterprise={enterprise} />
      <main className="flex w-full flex-1 flex-col overflow-visible bg-white px-5 py-4 sm:px-10 sm:py-5 lg:w-[53%] lg:px-16 xl:px-24">
        <div className={`mx-auto flex w-full flex-1 flex-col ${wide ? 'max-w-[560px]' : 'max-w-[500px]'}`}>{children}</div>
      </main>
    </div>
  </div>
);

export default AuthShell;
