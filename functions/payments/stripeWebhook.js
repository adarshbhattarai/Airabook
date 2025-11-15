const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const functionsConfig = require('firebase-functions').config();
const Stripe = require('stripe');
const { paymentService, PaymentStatus } = require('./paymentService');

const stripeSecret = functionsConfig.stripe?.secret_key;
const webhookSecret = functionsConfig.stripe?.webhook_secret;

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;

exports.stripeWebhook = onRequest({ region: 'us-central1' }, async (req, res) => {
  if (!stripe || !webhookSecret) {
    logger.error('Stripe webhook secrets missing');
    res.status(500).send('Stripe not configured');
    return;
  }

  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
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


