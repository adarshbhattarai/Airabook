import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Check, ShieldCheck, User } from 'lucide-react';
import { Helmet } from 'react-helmet';
import AuthFooter from './components/AuthFooter';
import AuthShell from './components/AuthShell';

const V2AccountSelector = () => {
  const navigate = useNavigate();

  return (
    <AuthShell>
      <Helmet>
        <title>Choose account | Airabook</title>
        <meta name="description" content="Choose a personal or enterprise Airabook account." />
      </Helmet>
      <div className="flex flex-col">
        <div className="shrink-0">
          <div className="flex items-center justify-between">
          <Link to="/" className="text-sm font-medium text-slate-600 transition hover:text-violet-700">← Back to Airabook</Link>
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Sign in</span>
          </div>
          <div className="mb-6 mt-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Account access</p>
          <h2 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">How would you like to sign in?</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-600">Select the space you need. Personal and enterprise accounts use separate, secure sign-in flows.</p>
          </div>
        </div>
        <div className="pb-2">
          <div className="space-y-4">
          <button type="button" onClick={() => navigate('/v2/personal-login')} className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-950/5 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><User className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-slate-900">Personal Account</span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">Your books, memories, and personal creative space.</span>
            </span>
            <ArrowRight className="h-5 w-5 text-violet-400 transition group-hover:translate-x-1" />
          </button>
          <button type="button" onClick={() => navigate('/v2/enterprise-login')} className="group flex w-full items-center gap-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50/60 p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-lg hover:shadow-violet-950/5 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white shadow-md shadow-violet-700/20"><Building2 className="h-5 w-5" /></span>
            <span className="flex-1">
              <span className="flex items-center gap-2 text-base font-semibold text-slate-900">Enterprise Workspace <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-700">Teams</span></span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">Your organization’s managed and secure workspace.</span>
            </span>
            <ArrowRight className="h-5 w-5 text-violet-400 transition group-hover:translate-x-1" />
          </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] text-slate-600"><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />Secure sign-in</span><span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-600" />Separate workspaces</span></div>
          <p className="mt-6 text-center text-sm text-slate-600">New to Airabook? <Link to="/v2/personal-signup" className="font-semibold text-violet-700 hover:text-violet-800">Create a personal account</Link></p>
        </div>
      </div>
      <AuthFooter />
    </AuthShell>
  );
};

export default V2AccountSelector;
