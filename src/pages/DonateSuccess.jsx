import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { motion } from 'framer-motion';
import { firestore, functions } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { getBillingPlanLabel, getCreditBalance, hasVoiceAssistantAccess, normalizePlanState } from '@/lib/billing';

const formatAmount = (amountCents = 0, currency = 'usd') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format((amountCents || 0) / 100);
};

const BillingSuccess = () => {
  const [searchParams] = useSearchParams();
  const { user, billing } = useAuth();
  const [payment, setPayment] = useState(null);
  const [status, setStatus] = useState('loading');
  const [refreshing, setRefreshing] = useState(false);

  const flow = searchParams.get('flow') || 'support';
  const paymentId = searchParams.get('paymentId');
  const stripeSessionId = searchParams.get('session_id');
  const planState = normalizePlanState(billing);
  const hasVoiceAccess = hasVoiceAssistantAccess(billing);
  const creditBalance = getCreditBalance(billing);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (flow !== 'support' && flow !== 'credit_pack') {
        setStatus('ready');
        return;
      }

      if (!paymentId) {
        setStatus('missing');
        return;
      }

      try {
        const snapshot = await getDoc(doc(firestore, 'payments', paymentId));
        if (!active) return;
        if (snapshot.exists()) {
          setPayment(snapshot.data());
          setStatus('ready');
          return;
        }
        setStatus('pending');
      } catch (error) {
        console.error('Unable to load support payment', error);
        setStatus('error');
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [flow, paymentId]);

  useEffect(() => {
    if (!user || flow !== 'subscription') {
      return;
    }
    if (hasVoiceAccess || planState === 'past_due' || planState === 'unpaid') {
      return;
    }

    let cancelled = false;
    const refreshBilling = async () => {
      try {
        const callable = httpsCallable(functions, 'refreshBillingState');
        await callable();
        if (!cancelled) {
          setStatus('ready');
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Initial billing refresh did not complete:', error);
        }
      }
    };
    refreshBilling();
    return () => {
      cancelled = true;
    };
  }, [flow, hasVoiceAccess, planState, user]);

  const handleRefreshBilling = async () => {
    setRefreshing(true);
    try {
      const callable = httpsCallable(functions, 'refreshBillingState');
      await callable();
      setStatus('ready');
    } catch (error) {
      console.error('Unable to refresh billing', error);
      setStatus('error');
    } finally {
      setRefreshing(false);
    }
  };

  const headline = useMemo(() => {
    if (flow === 'subscription') {
      if (hasVoiceAccess) {
        return 'Subscription is active';
      }
      if (planState === 'past_due' || planState === 'unpaid') {
        return 'Subscription needs attention';
      }
      return 'Finishing your subscription';
    }
    if (flow === 'credit_pack') {
      return 'Credit pack successful';
    }
    if (status === 'ready' && payment?.status === 'completed') {
      return 'Support payment successful';
    }
    return 'Thanks for supporting Airabook';
  }, [flow, hasVoiceAccess, payment?.status, planState, status]);

  const detailCopy = useMemo(() => {
    if (flow === 'subscription') {
      if (!user) {
        return 'Sign in again if needed so we can finish syncing your billing state.';
      }
      if (hasVoiceAccess) {
        return `Your ${getBillingPlanLabel(billing)} plan is active with ${creditBalance.toLocaleString()} credits available.`;
      }
      if (planState === 'past_due' || planState === 'unpaid') {
        return 'Stripe reported a billing issue. Update payment details from billing to restore Pro access.';
      }
      return 'Stripe checkout completed. We are confirming your subscription and you can refresh billing if it takes longer than expected.';
    }

    if (flow === 'credit_pack') {
      return `Your credit pack checkout finished. Current balance: ${creditBalance.toLocaleString()} credits.`;
    }

    if (status === 'ready' && payment?.status === 'completed') {
      return `Your one-time support payment of ${formatAmount(payment.amount, payment.currency)} was successful.`;
    }
    if (status === 'pending') {
      return 'We are still confirming your support payment with Stripe.';
    }
    if (status === 'error') {
      return 'We could not confirm the payment yet. You can return to billing and try again.';
    }
    return 'We are confirming things with Stripe. This usually takes a few seconds.';
  }, [billing, creditBalance, flow, hasVoiceAccess, payment, planState, status, user]);

  return (
    <div className="min-h-screen bg-[#ecf0f1] flex items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-[#3498db]/10 p-10 text-center space-y-6"
      >
        <p className="text-sm uppercase tracking-[0.4em] text-[#3498db]">
          {flow === 'subscription' ? 'Billing update' : flow === 'credit_pack' ? 'Credits added' : 'Support received'}
        </p>
        <h1 className="text-4xl font-bold text-slate-900">{headline}</h1>
        <p className="text-slate-600">{detailCopy}</p>

        <div className="bg-[#f5fbff] border border-[#3498db]/30 rounded-2xl p-6 text-left space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-[#3498db]">Status</p>
          {flow === 'subscription' ? (
            <>
              <p className="text-2xl font-bold text-slate-900">{getBillingPlanLabel(billing)}</p>
              <p className="text-sm text-slate-500">
                Billing state: <span className="font-semibold text-slate-700">{planState}</span>
              </p>
              <p className="text-sm text-slate-500">
                Credits available: <span className="font-semibold text-slate-700">{creditBalance.toLocaleString()}</span>
              </p>
              {stripeSessionId ? (
                <p className="text-xs text-slate-400 break-words">Stripe session: {stripeSessionId}</p>
              ) : null}
            </>
          ) : flow === 'credit_pack' ? (
            <>
              <p className="text-3xl font-bold text-slate-900">{creditBalance.toLocaleString()} credits</p>
              <p className="text-sm text-slate-500">Balance after your latest top-up.</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-slate-900">
                {payment ? formatAmount(payment.amount, payment.currency) : '--'}
              </p>
              <p className="text-sm text-slate-500">
                Payment state:{' '}
                <span className="font-semibold text-[#2ecc71]">
                  {payment?.status ? payment.status : status === 'pending' ? 'processing' : 'waiting'}
                </span>
              </p>
              {paymentId ? (
                <p className="text-xs text-slate-400 break-words">Payment ID: {paymentId}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-4">
          <Button asChild className="bg-[#3498db] hover:bg-[#2c82c9] text-white w-full">
            <Link to="/billing">Back to billing</Link>
          </Button>

          {flow === 'subscription' ? (
            <Button
              type="button"
              variant="outline"
              className="border-[#2ecc71] text-[#2ecc71] hover:bg-[#2ecc71]/10 w-full"
              onClick={handleRefreshBilling}
              disabled={!user || refreshing}
            >
              {refreshing ? 'Refreshing...' : (user ? 'Refresh billing' : 'Sign in to refresh')}
            </Button>
          ) : (
            <Button
              asChild
              variant="outline"
              className="border-[#2ecc71] text-[#2ecc71] hover:bg-[#2ecc71]/10 w-full"
            >
              <Link to="/dashboard">Go to dashboard</Link>
            </Button>
          )}
        </div>

        <p className="text-xs text-slate-400">
          Need help with billing? Contact support@airabook.app and include your payment or Stripe session reference.
        </p>
      </motion.div>
    </div>
  );
};

export default BillingSuccess;
