import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { getStripe } from '@/lib/stripe';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Heart, Coffee } from 'lucide-react';

const presetAmounts = [3, 5, 10];

const Donate = () => {
  const { user, appUser } = useAuth();
  const { toast } = useToast();
  const [selectedAmount, setSelectedAmount] = useState(presetAmounts[1]);
  const [customAmount, setCustomAmount] = useState('');
  const [note, setNote] = useState('Thanks for creating Airäbook! ☕');
  const [loading, setLoading] = useState(false);

  const resolvedAmount = customAmount ? Number(customAmount) : selectedAmount;

  const handleCheckout = async () => {
    if (!user) {
      toast({
        title: 'Please sign in',
        description: 'We need to know where to send your thank-you note!',
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
      console.log('🛒 Starting donation checkout...', { amount: resolvedAmount });
      const callable = httpsCallable(functions, 'createCheckoutSession');
      const amountInCents = Math.round(resolvedAmount * 100);
      
      console.log('📞 Calling createCheckoutSession...', { 
        amountInCents, 
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

  const hasDonated = appUser?.billing?.planTier;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <section className="text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-app-iris to-app-violet text-white mb-4">
            <Heart className="h-8 w-8" />
          </div>
          <h1 className="text-[32px] font-semibold text-app-gray-900 leading-tight">
            Support Airäbook
          </h1>
          <p className="text-base text-app-gray-600 leading-relaxed max-w-2xl mx-auto">
            Airäbook is <strong>free for everyone, forever</strong>. If you find it useful, consider buying us a coffee 
            to help cover hosting and AI costs. Every bit helps keep the service running! ☕
          </p>
          {hasDonated && (
            <div className="inline-flex items-center gap-2 rounded-pill bg-app-mint/10 px-4 py-2 text-sm font-medium text-app-mint border border-app-mint/20">
              <Heart className="h-4 w-4 fill-current" />
              Thank you for your support! You're amazing.
            </div>
          )}
        </section>

        <div className="bg-white rounded-2xl shadow-appSoft border border-app-gray-100 p-6 sm:p-8 space-y-6">
          <div>
            <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide mb-3 block">
              Choose an amount
            </label>
            <div className="flex flex-wrap gap-3">
              {presetAmounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setSelectedAmount(amount);
                    setCustomAmount('');
                  }}
                  className={`px-5 py-2.5 rounded-pill border-2 font-medium transition ${
                    selectedAmount === amount && !customAmount
                      ? 'bg-app-iris text-white border-app-iris shadow-md'
                      : 'border-app-gray-300 text-app-gray-900 hover:border-app-iris'
                  }`}
                >
                  ${amount}
                </button>
              ))}
              <div className="flex items-center gap-2">
                <span className="text-sm text-app-gray-600">$</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                  }}
                  placeholder="Custom"
                  className="w-28 text-center"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide mb-2 block">
              Optional message (shown to us)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px]"
              maxLength={280}
              placeholder="Thanks for building this!"
            />
            <p className="text-xs text-app-gray-600 mt-1 text-right">{note.length}/280</p>
          </div>

          <div className="pt-4 border-t border-app-gray-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-app-gray-600 uppercase tracking-wide">Total</p>
              <p className="text-3xl font-bold text-app-gray-900">
                ${(resolvedAmount || 0).toFixed(2)}
              </p>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={loading || !resolvedAmount}
              variant="appSuccess"
              className="inline-flex items-center gap-2 px-8 py-3 text-base"
            >
              <Coffee className="h-5 w-5" />
              {loading ? 'Processing...' : 'Donate now'}
            </Button>
          </div>
        </div>

        <p className="text-xs text-app-gray-600 text-center leading-relaxed">
          Your donation helps keep Airäbook online and accessible to everyone. 
          You'll be redirected to Stripe for secure payment processing.
        </p>
      </div>
    </div>
  );
};

export default Donate;


