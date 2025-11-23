import { loadStripe } from '@stripe/stripe-js';

let stripePromise;

export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    console.log('🔑 Stripe publishable key:', publishableKey ? `${publishableKey.substring(0, 20)}...` : 'MISSING');
    
    if (!publishableKey) {
      throw new Error('Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable.');
    }
    
    if (!publishableKey.startsWith('pk_')) {
      throw new Error('Invalid Stripe publishable key format. Must start with pk_');
    }
    
    console.log('📦 Loading Stripe.js...');
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};


