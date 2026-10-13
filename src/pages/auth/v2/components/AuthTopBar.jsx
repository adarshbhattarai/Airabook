import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

const AuthTopBar = () => (
  <div className="mb-4 flex shrink-0 items-center justify-between">
    <Link to="/" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-violet-700">
      <ArrowLeft className="h-4 w-4" /> Back to Airabook
    </Link>
    <div className="flex items-center gap-2 rounded-[8px] bg-emerald-50 px-2.5 py-1.5 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Secure access</div>
  </div>
);

export default AuthTopBar;
