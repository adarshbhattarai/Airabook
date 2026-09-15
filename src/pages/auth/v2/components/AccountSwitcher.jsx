import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, User } from 'lucide-react';

const AccountSwitcher = ({ active }) => (
  <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
    <Link
      to="/v2/personal-login"
      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${active === 'personal' ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-100' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
      aria-current={active === 'personal' ? 'page' : undefined}
    >
      <User className="h-4 w-4" /> Personal Account
    </Link>
    <Link
      to="/v2/enterprise-login"
      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition sm:text-sm ${active === 'enterprise' ? 'bg-white text-violet-700 shadow-sm ring-1 ring-slate-100' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
      aria-current={active === 'enterprise' ? 'page' : undefined}
    >
      <Building2 className="h-4 w-4" /> Enterprise
    </Link>
  </div>
);

export default AccountSwitcher;
