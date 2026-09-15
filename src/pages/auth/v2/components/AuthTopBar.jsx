import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const AuthTopBar = () => (
  <div className="mb-4 flex shrink-0 items-center justify-between">
    <Link to="/v2/login" className="flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-violet-700">
      <ArrowLeft className="h-4 w-4" /> Account selection
    </Link>
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Secure access</div>
  </div>
);

export default AuthTopBar;
