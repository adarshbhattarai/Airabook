import { loadStripe } from '@stripe/stripe-js';

let stripePromise;

export const getStripe = () => {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      throw new Error('Missing VITE_STRIPE_PUBLISHABLE_KEY environment variable.');
    }
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise;
};


