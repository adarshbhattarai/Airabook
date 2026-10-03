import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { Lock, Mail, User, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const PersonalSignup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { signup, signInWithGoogle } = useAuth();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      const credential = await signup(name, email, password);
      toast({ title: '✅ Account created!', description: 'Welcome! Please check your email to verify your account.' });
      const destination = await getPostLoginDestination(credential.user.uid, location.state?.from);
      navigate(destination, { replace: true, state: destination.state });
    } catch (error) {
      console.error('Failed to sign up', error);
      toast({ title: 'Unable to create your account', description: 'Please check your details and try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      const credential = await signInWithGoogle();
      const destination = await getPostLoginDestination(credential.user.uid, location.state?.from);
      navigate(destination, { replace: true, state: destination.state });
    } catch (error) {
      console.error('Failed to sign up with Google', error);
      toast({ title: 'Unable to sign up with Google', description: 'Please try again later.', variant: 'destructive' });
    }
  };

  return (
    <AuthShell>
      <Helmet><title>Personal signup | Airabook</title><meta name="description" content="Create your personal Airabook account." /></Helmet>
      <div className="flex flex-col">
        <div className="shrink-0">
          <AuthTopBar />
          <AccountSwitcher active="personal" />
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Personal account</p>
            <h2 className="text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-3xl">Create your account</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Start building your story with Airabook.</p>
          </div>
        </div>
        <div className="pb-2">
          <form onSubmit={handleSubmit} className="space-y-5">
          <AuthField id="personal-signup-name" label="Your name" icon={User} autoComplete="name" placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
          <AuthField id="personal-signup-email" label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <AuthField id="personal-signup-password" label="Password" icon={Lock} type="password" autoComplete="new-password" placeholder="Create a password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <p className="text-xs leading-5 text-slate-500">By creating an account, you agree to Airabook’s terms and privacy policy.</p>
          <Button type="submit" disabled={isLoading} className="h-12 w-full rounded-xl bg-violet-700 text-sm font-semibold text-white shadow-lg shadow-violet-700/20 transition hover:bg-violet-800 disabled:opacity-60"><UserPlus className="mr-2 h-4 w-4" />{isLoading ? 'Creating account…' : 'Create personal account'}</Button>
          </form>
          <Divider />
          <Button type="button" onClick={handleGoogleSignUp} variant="outline" className="h-12 w-full rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-700"><GoogleIcon />Continue with Google</Button>
        </div>
        <p className="shrink-0 pt-3 text-center text-sm text-slate-600">Already have an account? <Link to="/v2/personal-login" className="font-semibold text-violet-700 hover:text-violet-800">Sign in</Link></p>
      </div>
      <AuthFooter />
    </AuthShell>
  );
};

export default PersonalSignup;
