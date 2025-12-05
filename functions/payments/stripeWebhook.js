const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const Stripe = require('stripe');
const { paymentService, PaymentStatus } = require('./paymentService');

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_SECRET ||
  process.env.STRIPE_API_KEY ||
  null;
// Trim webhook secret to remove any whitespace/newlines
const webhookSecret =
  (process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK || '').trim() || null;

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;

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
        await paymentService.markPaymentCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
        await paymentService.markPaymentFailed(event.data.object, PaymentStatus.expired);
        break;
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


