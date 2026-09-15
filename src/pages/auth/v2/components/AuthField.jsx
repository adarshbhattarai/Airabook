import React from 'react';

const AuthField = ({ id, label, icon: Icon, ...props }) => (
  <div>
    <label htmlFor={id} className="mb-2 block text-xs font-semibold tracking-[0.01em] text-slate-700">{label}</label>
    <div className="relative">
      <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input id={id} required className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm outline-none transition duration-150 placeholder:text-slate-500 hover:border-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100/80 disabled:cursor-not-allowed disabled:bg-slate-50" {...props} />
    </div>
  </div>
);

export default AuthField;
