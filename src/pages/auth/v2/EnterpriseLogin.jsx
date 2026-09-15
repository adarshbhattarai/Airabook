import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { ArrowRight, Building2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitEnterpriseLoginDemo } from '@/services/enterpriseOnboardingService';
import AccountSwitcher from './components/AccountSwitcher';
import AuthField from './components/AuthField';
import AuthFooter from './components/AuthFooter';
import AuthShell from './components/AuthShell';
import AuthTopBar from './components/AuthTopBar';

const EnterpriseLogin = () => {
  const [workspace, setWorkspace] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;

    setIsSubmitting(true);
    setSubmitError('');
    try {
      await submitEnterpriseLoginDemo({ workspaceSlug: workspace, email, password });
      navigate('/v2/enterprise-home', { state: { workspace } });
    } catch (error) {
      console.error('Unable to submit enterprise login demo', error);
      setSubmitError('We could not reach the demo service. Make sure localhost:8000 is running and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell enterprise>
      <Helmet><title>Enterprise login | Airabook</title><meta name="description" content="Sign in to your Airabook enterprise workspace." /></Helmet>
      <div className="flex flex-col">
        <div className="shrink-0">
          <AuthTopBar />
          <AccountSwitcher active="enterprise" />
          <div className="mb-4">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-violet-700"><Building2 className="h-3.5 w-3.5" /> Enterprise</div>
          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Access your workspace</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">Enter your workspace details to continue to your organization’s managed environment.</p>
          </div>
        </div>
        <div className="pb-2">
          <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="workspace-url" className="mb-2 block text-xs font-semibold text-slate-700">Workspace URL</label>
            <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100">
              <input id="workspace-url" name="workspace_slug" required pattern="[a-z0-9-]+" title="Use lowercase letters, numbers, and hyphens only" value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSubmitError(''); }} placeholder="your-company" className="min-w-0 flex-1 border-0 px-4 py-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400" aria-describedby="workspace-help" />
              <span className="flex items-center border-l border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">.airabook.com</span>
            </div>
            <p id="workspace-help" className="mt-2 text-xs text-slate-500">Use the workspace name provided by your organization.</p>
          </div>
          <AuthField id="enterprise-email" name="email" label="Work email" icon={Mail} type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => { setEmail(event.target.value); setSubmitError(''); }} />
          <AuthField id="enterprise-password" name="password" label="Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => { setPassword(event.target.value); setSubmitError(''); }} />
          <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-semibold text-violet-700 hover:text-violet-800">Forgot your password?</Link></div>
          {submitError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-5 text-rose-700">{submitError}</div>}
          <Button type="submit" disabled={isSubmitting} className="h-12 w-full rounded-xl bg-violet-700 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800 disabled:opacity-60"><ArrowRight className="mr-2 h-4 w-4" />{isSubmitting ? 'Signing in…' : 'Continue to Workspace'}</Button>
          </form>
        </div>
        <div className="shrink-0 pt-3">
          <div className="mb-2 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs text-slate-500">New to Enterprise?</span><div className="h-px flex-1 bg-slate-200" /></div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
            <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-violet-700 shadow-sm"><ShieldCheck className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-slate-900">Need a managed workspace?</h3><p className="mt-1 text-xs leading-5 text-slate-600">Sign in with your Personal Account first, then submit a request for System Admin approval.</p></div></div>
            <Link to="/v2/enterprise-signup" className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-violet-600 px-4 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-white">Request an Enterprise account <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
        </div>
      </div>
      <AuthFooter />
    </AuthShell>
  );
};

export default EnterpriseLogin;
