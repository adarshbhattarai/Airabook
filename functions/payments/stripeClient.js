const Stripe = require('stripe');

try {
  require('dotenv').config();
} catch (_) {
  // Local dotenv is optional in deployed environments.
}

const stripeSecret =
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_SECRET ||
  process.env.STRIPE_API_KEY ||
  null;

const appBaseUrl =
  process.env.STRIPE_PUBLIC_URL ||
  process.env.APP_PUBLIC_URL ||
  'http://localhost:5173';

const portalReturnUrl =
  process.env.STRIPE_PORTAL_RETURN_URL ||
  `${appBaseUrl}/billing`;

const creatorMonthlyPriceId =
  process.env.STRIPE_CREATOR_MONTHLY_PRICE_ID ||
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID ||
  null;

const proMonthlyPriceId =
  process.env.STRIPE_PRO_PLUS_MONTHLY_PRICE_ID ||
  null;

const premiumMonthlyPriceId =
  process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID ||
  null;

const legacyCreatorPriceIds = [
  creatorMonthlyPriceId,
  ...(process.env.STRIPE_LEGACY_PRO_PRICE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
];

const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;

module.exports = {
  appBaseUrl,
  creatorMonthlyPriceId,
  legacyCreatorPriceIds,
  portalReturnUrl,
  premiumMonthlyPriceId,
  proMonthlyPriceId,
  stripe,
  stripeSecret,
};
