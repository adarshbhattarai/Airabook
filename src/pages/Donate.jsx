import React, { useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { motion } from 'framer-motion';
import { functions } from '@/lib/firebase';
import { getStripe } from '@/lib/stripe';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';

const presetAmounts = [1, 5, 10];

const planOptions = {
  supporter: {
    label: 'Supporter',
    description: 'Unlock writing, help keep Airabook alive, and choose any amount you like.',
    amount: null,
    highlight: 'Most flexible',
    features: ['Read every book', 'Write unlimited books', 'Support indie dev'],
  },
  pro: {
    label: 'Pro Writer',
    description: 'Serious writers who want more storage and faster AI tools.',
    amount: 15,
    highlight: 'Popular',
    features: ['All supporter perks', 'Priority chapter generation', 'Early access to AI tools'],
  },
  enterprise: {
    label: 'Enterprise Studio',
    description: 'Studios or teachers who collaborate as a team.',
    amount: 99,
    highlight: 'Team ready',
    features: ['All pro perks', 'Team workspaces', 'Priority support channel'],
  },
};

const Donate = () => {
  const { user, appUser } = useAuth();
  const { toast } = useToast();
  const [selectedAmount, setSelectedAmount] = useState(presetAmounts[1]);
  const [customAmount, setCustomAmount] = useState('');
  const [planTier, setPlanTier] = useState('supporter');
  const [note, setNote] = useState('Helping keep Airabook running <3');
  const [loading, setLoading] = useState(false);

  const resolvedAmount = useMemo(() => {
    if (planTier !== 'supporter') {
      return planOptions[planTier].amount;
    }
    if (customAmount) {
      return Number(customAmount);
    }
    return selectedAmount;
  }, [customAmount, planTier, selectedAmount]);

  const handleCheckout = async () => {
    if (!user) {
      toast({
        title: 'Please sign in',
        description: 'You need an account so we know which plan to unlock.',
        variant: 'destructive',
      });
      return;
    }

    if (!resolvedAmount || Number.isNaN(resolvedAmount) || resolvedAmount < 1) {
      toast({
        title: 'Choose an amount',
        description: 'Donation must be at least $1.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      console.log('🛒 Starting checkout...', { amount: resolvedAmount, planTier });
      const callable = httpsCallable(functions, 'createCheckoutSession');
      const amountInCents = Math.round(resolvedAmount * 100);
      
      console.log('📞 Calling createCheckoutSession...', { 
        amountInCents, 
        planTier,
        user: user?.uid 
      });
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Function call timed out after 30 seconds')), 30000)
      );
      
      const response = await Promise.race([
        callable({
          amount: amountInCents,
          currency: 'usd',
          planTier,
          note,
          successUrl: `${window.location.origin}/donate/success`,
          cancelUrl: `${window.location.origin}/donate`,
        }),
        timeoutPromise
      ]);

      console.log('✅ Function response received:', response);
      console.log('✅ Response data:', response.data);
      
      if (!response || !response.data) {
        throw new Error('No response from server');
      }
      
      if (!response.data?.sessionId) {
        console.error('❌ No sessionId in response:', response.data);
        throw new Error('No session ID returned from server. Response: ' + JSON.stringify(response.data));
      }

      console.log('🔑 Session ID:', response.data.sessionId);
      
      // Use the checkout URL directly for reliable redirect
      // Stripe.js redirectToCheckout sometimes hangs in local development
      if (response.data.checkoutUrl) {
        console.log('🔄 Redirecting to Stripe checkout:', response.data.checkoutUrl);
        window.location.href = response.data.checkoutUrl;
        // Don't set loading to false - we're redirecting
        return;
      }
      
      // Fallback: try Stripe.js method if URL not available
      console.log('⚠️ No checkout URL, trying Stripe.js redirect...');
      const stripe = await getStripe();
      console.log('✅ Stripe instance loaded');
      
      // Add timeout to prevent hanging
      const redirectPromise = stripe.redirectToCheckout({
        sessionId: response.data.sessionId,
      });
      
      const redirectTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stripe redirect timed out')), 5000)
      );
      
      const { error: stripeError } = await Promise.race([redirectPromise, redirectTimeout]);
      
      if (stripeError) {
        console.error('❌ Stripe redirect failed:', stripeError);
        throw new Error(stripeError.message || 'Failed to redirect to checkout');
      }
    } catch (error) {
      console.error('❌ Stripe checkout error:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        stack: error.stack,
        name: error.name
      });
      
      // Don't set loading to false if we're redirecting
      if (error.message?.includes('redirect') || error.code === 'redirect') {
        console.log('Redirect in progress, not resetting loading state');
        return;
      }
      
      toast({
        title: 'Unable to start checkout',
        description: error.message || error.details || 'Please try again.',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-10">
        <section className="space-y-4">
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-sm uppercase tracking-[0.3em] text-[#3498db]">
            Powered by our community
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-[28px] sm:text-4xl font-semibold text-app-gray-900 leading-tight">
            Keep Airabook free for every reader
          </motion.h1>
          <p className="text-sm text-app-gray-600 max-w-3xl">
            Hosting, AI, and storage bills add up quickly. Your donation keeps the service active and
            unlocks creation tools for your account.
          </p>
          {appUser?.billing?.planTier === 'supporter' && (
            <p className="text-sm text-[#2ecc71] font-medium">
              Thank you! You already have writing privileges. Extra support keeps the lights on.
            </p>
          )}
        </section>

        <section className="grid lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-appSoft p-6 border border-app-gray-100">
            <p className="text-sm font-semibold text-[#3498db] mb-3">Choose an amount</p>
            <div className="flex flex-wrap gap-3 mb-6">
              {presetAmounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setPlanTier('supporter');
                    setSelectedAmount(amount);
                    setCustomAmount('');
                  }}
                  className={`px-4 py-2 rounded-full border transition ${
                    planTier === 'supporter' && selectedAmount === amount && !customAmount
                      ? 'bg-[#3498db] text-white border-transparent shadow-lg'
                      : 'border-slate-200 text-slate-600 hover:border-[#3498db]'
                  }`}
                >
                  ${amount}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">$</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={planTier === 'supporter' ? customAmount : ''}
                  onChange={(e) => {
                    setPlanTier('supporter');
                    setCustomAmount(e.target.value);
                    setSelectedAmount(presetAmounts[0]);
                  }}
                  placeholder="Custom"
                  className="w-28 text-center"
                />
              </div>
            </div>
            <p className="text-xs text-app-gray-600 mb-4">
              Need it to keep the service active. Every contribution directly pays for Firebase,
              storage, and AI costs.
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[100px]"
              maxLength={280}
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{note.length}/280</p>
          </div>

          <div className="grid gap-6">
            {Object.entries(planOptions).map(([tier, plan]) => (
              <div
                key={tier}
                className={`rounded-2xl border p-5 bg-white shadow-appSoft transition cursor-pointer ${
                  planTier === tier ? 'border-app-iris shadow-appCard' : 'border-app-gray-100/70'
                }`}
                onClick={() => setPlanTier(tier)}
              >
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-app-gray-600">{plan.highlight}</p>
                    <h3 className="text-lg font-semibold text-app-gray-900">{plan.label}</h3>
                  </div>
                  <p className="text-2xl font-bold text-[#3498db]">
                    {plan.amount ? `$${plan.amount}` : `$${resolvedAmount || selectedAmount}`}
                    <span className="text-base font-normal text-slate-500">/one-time</span>
                  </p>
                </div>
                <p className="text-sm text-app-gray-600 mb-4">{plan.description}</p>
                <ul className="space-y-2 text-xs text-app-gray-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <span className="text-[#2ecc71]">●</span>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-appSoft border border-app-gray-100 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-app-gray-600">Summary</p>
            <h4 className="text-lg font-semibold text-app-gray-900">{planOptions[planTier].label}</h4>
            <p className="text-xs text-app-gray-600 mt-1">
              {planTier === 'supporter'
                ? 'Grants writing ability and keeps the service online.'
                : 'Unlocks pro entitlements the moment Stripe confirms payment.'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-app-gray-600 mb-1">Total</p>
            <p className="text-2xl sm:text-3xl font-bold text-[#2ecc71]">
              ${resolvedAmount?.toFixed(2) ?? '0.00'}
            </p>
          </div>
          <Button
            onClick={handleCheckout}
            disabled={loading}
            variant="appPrimary"
            className="px-6 py-3 rounded-pill text-sm w-full sm:w-auto"
          >
            {loading ? 'Redirecting...' : 'Donate & continue'}
          </Button>
        </section>
      </div>
    </div>
  );
};

export default Donate;


