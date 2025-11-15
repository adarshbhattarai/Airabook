const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const functionsConfig = require('firebase-functions').config();
const Stripe = require('stripe');
const { paymentService } = require('./paymentService');

const stripeSecret = functionsConfig.stripe?.secret_key;
if (!stripeSecret) {
  logger.warn('Stripe secret key is not configured via functions config.');
}

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;
const appBaseUrl = functionsConfig.app?.public_url || 'http://localhost:5173';

const normalizeAmount = (value) => {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    return Math.trunc(Number(value));
  }
  return 0;
};

exports.createCheckoutSession = onCall({ region: 'us-central1' }, async (request) => {
  if (!stripe) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe secret key missing. Configure functions config: stripe.secret_key',
    );
  }

  const { auth, data = {} } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to create a donation session.');
  }

  const amount = normalizeAmount(data.amount);
  const currency = (data.currency || 'usd').toLowerCase();
  const planTier = data.planTier || 'supporter';
  const note = typeof data.note === 'string' ? data.note.slice(0, 280) : null;

  if (Number.isNaN(amount) || amount < 100) {
    throw new HttpsError(
      'invalid-argument',
      'Amount must be at least 100 (cents). Pass whole numbers in the smallest currency unit.',
    );
  }

  const successUrl =
    typeof data.successUrl === 'string' && data.successUrl.startsWith('http')
      ? data.successUrl
      : `${appBaseUrl}/donate/success`;
  const cancelUrl =
    typeof data.cancelUrl === 'string' && data.cancelUrl.startsWith('http')
      ? data.cancelUrl
      : `${appBaseUrl}/donate`;

  const { paymentId, planConfig } = await paymentService.createPendingPayment({
    userId: auth.uid,
    amount,
    currency,
    planTier,
    note,
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: auth.token.email || undefined,
    payment_method_types: ['card'],
    success_url: `${successUrl}?paymentId=${paymentId}`,
    cancel_url: `${cancelUrl}?paymentId=${paymentId}&status=cancelled`,
    metadata: {
      paymentId,
      userId: auth.uid,
      planTier,
      amountCents: amount.toString(),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: `${planConfig.label} - Airabook`,
            description: note || 'Support the Airabook service',
          },
        },
      },
    ],
  });

  await paymentService.attachStripeSession(paymentId, session);
  logger.info(`Checkout session created`, { paymentId, sessionId: session.id });

  return { sessionId: session.id, paymentId };
});


