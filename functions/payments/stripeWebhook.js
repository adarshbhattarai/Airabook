const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { paymentService, PaymentStatus } = require('./paymentService');
const { userBillingRepository } = require('./userBillingRepository');
const {
  creatorMonthlyPriceId,
  legacyCreatorPriceIds,
  premiumMonthlyPriceId,
  proMonthlyPriceId,
  stripe,
  stripeSecret,
} = require('./stripeClient');

const webhookSecret =
  (process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK || '').trim() || null;

const resolveUserIdFromCustomer = async (customerId) => {
  if (!customerId) {
    return null;
  }

  const directHit = await userBillingRepository.findUserIdByStripeCustomerId(customerId);
  if (directHit) {
    return directHit;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    const userId = customer?.deleted ? null : customer?.metadata?.userId || null;
    return userId || null;
  } catch (error) {
    logger.warn('Unable to resolve Stripe customer metadata', {
      customerId,
      message: error?.message || 'unknown',
    });
    return null;
  }
};

const resolveUserIdFromSubscription = async (subscription) => {
  const metadataUserId = subscription?.metadata?.userId || null;
  if (metadataUserId) {
    return metadataUserId;
  }

  const subscriptionId = subscription?.id || null;
  const storedUserId = await userBillingRepository.findUserIdByStripeSubscriptionId(subscriptionId);
  if (storedUserId) {
    return storedUserId;
  }

  return await resolveUserIdFromCustomer(subscription?.customer || null);
};

const resolvePlanTierFromSubscription = (subscription) => {
  const metadataTier = subscription?.metadata?.planTier || null;
  if (metadataTier) {
    return metadataTier;
  }

  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  if (priceId && legacyCreatorPriceIds.includes(priceId)) {
    return 'creator';
  }
  if (priceId && creatorMonthlyPriceId && priceId === creatorMonthlyPriceId) {
    return 'creator';
  }
  if (priceId && proMonthlyPriceId && priceId === proMonthlyPriceId) {
    return 'pro';
  }
  if (priceId && premiumMonthlyPriceId && priceId === premiumMonthlyPriceId) {
    return 'premium';
  }
  return 'creator';
};

const syncSubscriptionEvent = async (subscription) => {
  const userId = await resolveUserIdFromSubscription(subscription);
  if (!userId) {
    throw new Error(`Could not resolve user for Stripe subscription ${subscription?.id || 'unknown'}.`);
  }

  await paymentService.syncSubscriptionFromStripe({
    userId,
    subscription,
    customerId: subscription?.customer || null,
    planTier: resolvePlanTierFromSubscription(subscription),
  });
};

const syncSubscriptionFromSession = async (session) => {
  if (!session?.subscription) {
    throw new Error('Missing subscription id on Stripe checkout session.');
  }
  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const userId =
    session?.metadata?.userId ||
    session?.client_reference_id ||
    await resolveUserIdFromSubscription(subscription);

  if (!userId) {
    throw new Error(`Could not resolve user for checkout session ${session?.id || 'unknown'}.`);
  }

  await paymentService.syncSubscriptionFromStripe({
    userId,
    subscription,
    customerId: session.customer || subscription.customer || null,
    planTier: resolvePlanTierFromSubscription(subscription),
  });
};

exports.stripeWebhook = onRequest({ 
  region: 'us-central1',
}, async (req, res) => {
  if (!stripe || !webhookSecret) {
    logger.error('Stripe webhook secrets missing', { 
      hasStripe: !!stripe, 
      hasWebhookSecret: !!webhookSecret 
    });
    res.status(500).send('Stripe not configured');
    return;
  }

  const signature = req.headers['stripe-signature'];
  if (!signature) {
    logger.error('Missing stripe-signature header');
    res.status(400).send('Missing stripe-signature header');
    return;
  }

  let event;

  try {
    // Get raw body - in Firebase Functions v2, req.rawBody should be available
    // If not available, we need to reconstruct from req.body (less reliable)
    let body;
    if (req.rawBody) {
      // rawBody is available - use it directly
      body = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody, 'utf8');
    } else if (req.body) {
      // Fallback: try to use req.body if it's a Buffer
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else {
        // If body is already parsed, we can't get exact raw bytes
        // This will likely fail signature verification
        logger.warn('rawBody not available and body is parsed JSON. Signature verification may fail.');
        body = Buffer.from(JSON.stringify(req.body), 'utf8');
      }
    } else {
      logger.error('No request body available');
      res.status(400).send('No request body');
      return;
    }
    
    // Log webhook secret info (first 10 chars only for security) for debugging
    logger.debug('Webhook verification attempt', {
      secretLength: webhookSecret?.length,
      secretPrefix: webhookSecret?.substring(0, 10),
      bodyType: body?.constructor?.name,
      bodyLength: body?.length,
      hasSignature: !!signature,
      hasRawBody: !!req.rawBody,
    });
    
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error('Stripe signature verification failed', { message: err.message });
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        if (event.data.object?.mode === 'subscription') {
          await syncSubscriptionFromSession(event.data.object);
        } else {
          await paymentService.markPaymentCompleted(event.data.object);
        }
        break;
      case 'checkout.session.expired':
        await paymentService.markPaymentFailed(event.data.object, PaymentStatus.expired);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscriptionEvent(event.data.object);
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subscriptionId = event.data.object?.subscription || null;
        if (!subscriptionId) {
          break;
        }
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscriptionEvent(subscription);
        break;
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.async_payment_succeeded':
        // async succeeded also fires checkout.session.completed so no-op
        if (event.type === 'checkout.session.async_payment_failed') {
          await paymentService.markPaymentFailed(event.data.object, PaymentStatus.failed);
        }
        break;
      case 'payment_intent.payment_failed':
        if (event.data.object?.metadata?.paymentId) {
          await paymentService.markPaymentFailed(
            { metadata: event.data.object.metadata, id: event.data.object.id },
            PaymentStatus.failed,
          );
        }
        break;
      default:
        logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  } catch (error) {
    logger.error('Error handling Stripe event', {
      type: event.type,
      message: error.message,
    });
    res.status(500).send('Webhook handler error');
    return;
  }

  res.json({ received: true });
});


