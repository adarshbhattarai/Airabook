import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Lock, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { getPostLoginDestination } from '@/services/postLoginRouting';
import AccountSwitcher from './components/AccountSwitcher';
import AuthField from './components/AuthField';
import AuthFooter from './components/AuthFooter';
import AuthShell from './components/AuthShell';
import AuthTopBar from './components/AuthTopBar';
import Divider from './components/Divider';
import GoogleIcon from './components/GoogleIcon';

const PersonalLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, login, signInWithGoogle, resendVerificationEmail } = useAuth();
  const isEnterpriseSignupRedirect = location.state?.from?.pathname === '/v2/enterprise-signup';
  const [showEnterpriseLoginNotice, setShowEnterpriseLoginNotice] = useState(isEnterpriseSignupRedirect);

  useEffect(() => {
    if (user && !user.emailVerified) {
      toast({
        title: '📧 Please verify your email',
        description: 'You must verify your email to access all features.',
        variant: 'warning',
        action: <Button onClick={handleResendVerification}>Resend</Button>,
      });
    }
  }, [user]);

  useEffect(() => {
    if (isEnterpriseSignupRedirect) {
      setShowEnterpriseLoginNotice(true);
    }
  }, [isEnterpriseSignupRedirect]);

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail();
      toast({ title: '✅ Verification email sent!', description: 'Please check your inbox.' });
    } catch (error) {
      toast({ title: 'Unable to resend email', description: 'Please try again later.', variant: 'destructive' });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const credential = await login(email, password);
      toast({ title: '🎉 Welcome back!', description: "You've successfully logged in." });
      navigate(await getPostLoginDestination(credential.user.uid, location.state?.from), { replace: true });
    } catch (error) {
      console.error('Failed to log in', error);
      toast({ title: 'Unable to sign in', description: 'Please check your email and password and try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const credential = await signInWithGoogle();
      navigate(await getPostLoginDestination(credential.user.uid, location.state?.from), { replace: true });
    } catch (error) {
      console.error('Failed to sign in with Google', error);
      toast({ title: 'Unable to sign in with Google', description: 'Please try again later.', variant: 'destructive' });
    }
  };

  return (
    <AuthShell>
      <Helmet><title>Personal login | Airabook</title><meta name="description" content="Sign in to your personal Airabook account." /></Helmet>
      <Dialog open={showEnterpriseLoginNotice} onOpenChange={setShowEnterpriseLoginNotice}>
        <DialogContent className="max-w-md rounded-2xl border border-violet-100 bg-white p-6 shadow-2xl">
          <DialogHeader>
            <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <DialogTitle className="text-xl text-slate-950">Log in to create an Enterprise account</DialogTitle>
            <DialogDescription className="leading-6 text-slate-600">
              You need to log in to your Personal Account before you can request an Enterprise account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5">
            <Button type="button" onClick={() => setShowEnterpriseLoginNotice(false)} className="bg-violet-700 text-white hover:bg-violet-800">
              Continue to login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col">
        <div className="shrink-0">
          <AuthTopBar />
          <AccountSwitcher active="personal" />
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Personal account</p>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Sign in to continue your story.</p>
          </div>
        </div>
        <div className="pb-2">
        <form onSubmit={handleSubmit} className="space-y-5">
          <AuthField id="personal-email" label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <AuthField id="personal-password" label="Password" icon={Lock} type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <div className="flex justify-end"><Link to="/forgot-password" className="text-sm font-semibold text-violet-700 hover:text-violet-800">Forgot your password?</Link></div>
          <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-xl bg-violet-700 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800 disabled:opacity-60"><LogIn className="mr-2 h-4 w-4" />{isLoading ? 'Signing in…' : 'Sign in'}</Button>
        </form>
        <Divider />
        <Button type="button" onClick={handleGoogleSignIn} variant="outline" className="h-12 w-full rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-700"><GoogleIcon />Continue with Google</Button>
        </div>
        <p className="shrink-0 pt-3 text-center text-sm text-slate-600">Don’t have a personal account? <Link to="/v2/personal-signup" state={location.state} className="font-semibold text-violet-700 hover:text-violet-800">Sign up</Link></p>
      </div>
      <AuthFooter />
    </AuthShell>
  );
};

export default PersonalLogin;
