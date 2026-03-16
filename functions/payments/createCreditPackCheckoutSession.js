const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { paymentService } = require('./paymentService');
const { getCreditPackConfig } = require('./catalog');
const { appBaseUrl, stripe, stripeSecret } = require('./stripeClient');

exports.createCreditPackCheckoutSession = onCall({ region: 'us-central1', cors: true }, async (request) => {
  if (!stripe) {
    throw new HttpsError(
      'failed-precondition',
      'Stripe secret key missing. Set STRIPE_SECRET_KEY (or STRIPE_SECRET/STRIPE_API_KEY) in the environment.',
    );
  }

  const { auth, data = {} } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to buy credits.');
  }

  const pack = getCreditPackConfig(data.packId);
  if (!pack) {
    throw new HttpsError('invalid-argument', 'Select a valid credit pack.');
  }

  const successUrl =
    typeof data.successUrl === 'string' && data.successUrl.startsWith('http')
      ? data.successUrl
      : `${appBaseUrl}/billing/success`;
  const cancelUrl =
    typeof data.cancelUrl === 'string' && data.cancelUrl.startsWith('http')
      ? data.cancelUrl
      : `${appBaseUrl}/billing`;

  logger.info('Creating credit pack checkout', {
    hasStripe: !!stripe,
    hasStripeSecret: !!stripeSecret,
    packId: pack.id,
    userId: auth.uid,
  });

  const { paymentId } = await paymentService.createPendingPayment({
    userId: auth.uid,
    amount: pack.amountCents,
    currency: 'usd',
    planTier: 'supporter',
    source: 'credit_pack',
    metadata: {
      flow: 'credit_pack',
      creditPackId: pack.id,
      credits: pack.credits,
    },
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: auth.token.email || undefined,
    payment_method_types: ['card'],
    success_url: `${successUrl}?flow=credit_pack&paymentId=${paymentId}`,
    cancel_url: `${cancelUrl}?flow=credit_pack&paymentId=${paymentId}&status=cancelled`,
    metadata: {
      paymentId,
      userId: auth.uid,
      flow: 'credit_pack',
      creditPackId: pack.id,
      credits: String(pack.credits),
      amountCents: String(pack.amountCents),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: pack.amountCents,
          product_data: {
            name: pack.label,
            description: `${pack.credits.toLocaleString()} Airabook credits`,
          },
        },
      },
    ],
  });

  await paymentService.attachStripeSession(paymentId, session);

  return {
    sessionId: session.id,
    paymentId,
    checkoutUrl: session.url,
  };
});
