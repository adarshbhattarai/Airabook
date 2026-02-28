import React, { useEffect, useMemo, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const EmailVerificationNotice = () => {
  const { user, resendVerificationEmail } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const dismissKey = useMemo(() => (
    user?.uid ? `airabook:verify-notice-dismissed:${user.uid}` : null
  ), [user?.uid]);

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }
    const isDismissed = sessionStorage.getItem(dismissKey) === '1';
    setDismissed(isDismissed);
  }, [dismissKey]);

  if (!user || user.emailVerified || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    if (dismissKey) {
      sessionStorage.setItem(dismissKey, '1');
    }
    setDismissed(true);
  };

  const handleResend = async () => {
    setSending(true);
    try {
      await resendVerificationEmail();
      toast({
        title: 'Verification email sent',
        description: 'Check your inbox and spam folder for the verification link.',
      });
    } catch (error) {
      toast({
        title: 'Could not send verification email',
        description: error?.message || 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="h-4 w-4 shrink-0" />
          <p className="truncate">
            Verify your account email to invite collaborators and receive collaboration invites.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={handleResend} disabled={sending}>
            {sending ? 'Sending...' : 'Resend verification email'}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationNotice;
