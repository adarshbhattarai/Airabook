import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Check, Clock3, ShieldCheck } from 'lucide-react';

const EnterpriseRequestPending = ({ workspace }) => (
  <div className="py-10 sm:py-12">
    <div className="mx-auto max-w-xl text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-8 ring-amber-50"><Clock3 className="h-8 w-8" /></div>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pending approval</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Your Enterprise Account is waiting for approval</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">Your request for <strong className="font-semibold text-slate-900">{workspace}.airabook.com</strong> has been submitted successfully. A System Administrator must approve it before the workspace becomes available.</p>
    </div>

    <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="space-y-5">
        <RequestStatusStep icon={Check} title="Request submitted" description="Your organization details were received." complete />
        <RequestStatusStep icon={Clock3} title="System Admin review" description="A System Administrator is verifying your organization." active />
        <RequestStatusStep icon={Building2} title="Enterprise Workspace activated" description="Available after approval using your Personal Account login." />
      </div>
    </div>

    <div className="mx-auto mt-6 max-w-xl rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-center text-xs leading-5 text-slate-600"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-violet-700" />You can continue using your Personal Account while the request is under review.</div>
    <div className="mt-7 flex justify-center"><Link to="/dashboard" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800">Return to dashboard <ArrowRight className="h-4 w-4" /></Link></div>
  </div>
);

const RequestStatusStep = ({ icon: Icon, title, description, complete = false, active = false }) => (
  <div className="flex items-start gap-4">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${complete ? 'bg-emerald-100 text-emerald-700' : active ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}><Icon className="h-4 w-4" /></span>
    <div className="min-w-0 text-left"><p className={`text-sm font-semibold ${active ? 'text-amber-800' : complete ? 'text-slate-900' : 'text-slate-500'}`}>{title}{active && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">Current</span>}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
  </div>
);

export default EnterpriseRequestPending;
