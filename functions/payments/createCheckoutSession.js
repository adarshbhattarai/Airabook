

exports.createCheckoutSession = onCall({ region: 'us-central1' }, async (request) => {
  // Lazy load config and initialize Stripe inside the function
  // This prevents startup crashes if config is missing
  const functionsConfig = require('firebase-functions').config();
  const stripeSecret = functionsConfig.stripe?.secret_key || process.env.STRIPE_SECRET_KEY;

  const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;
  const appBaseUrl = functionsConfig.app?.public_url || process.env.APP_PUBLIC_URL || 'http://localhost:5173';

  logger.info('createCheckoutSession called', {
    hasAuth: !!request.auth,
    hasStripe: !!stripe,
    configKeys: functionsConfig.stripe ? Object.keys(functionsConfig.stripe) : []
  });

  if (!stripe) {
    logger.error('Stripe not initialized', {
      hasSecret: !!stripeSecret,
      config: functionsConfig.stripe
    });
    throw new HttpsError(
      'failed-precondition',
      'Stripe secret key missing. Configure functions config: stripe.secret_key',
    );
  }

  const { auth, data = {} } = request;
  if (!auth) {
    logger.warn('Unauthenticated checkout attempt');
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

  try {
    logger.info('Creating pending payment...', { userId: auth.uid, amount, planTier });
    const { paymentId, planConfig } = await paymentService.createPendingPayment({
      userId: auth.uid,
      amount,
      currency,
      planTier,
      note,
    });
    logger.info('Pending payment created', { paymentId });

    logger.info('Creating Stripe checkout session...', { paymentId });
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
    logger.info('Stripe session created', { sessionId: session.id, url: session.url });

    await paymentService.attachStripeSession(paymentId, session);
    logger.info(`Checkout session created successfully`, { paymentId, sessionId: session.id });

    // Return both sessionId and the full checkout URL for fallback redirect
    return {
      sessionId: session.id,
      paymentId,
      checkoutUrl: session.url  // Include the full Stripe checkout URL
    };
  } catch (error) {
    logger.error('Error in createCheckoutSession', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      type: error.type
    });
    throw new HttpsError(
      'internal',
      `Failed to create checkout session: ${error.message}`,
    );
  }
});


