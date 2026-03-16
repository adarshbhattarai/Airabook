import { BILLING_PLANS } from '@/lib/billingCatalog';

const VOICE_ASSISTANT_ENABLED_TIERS = new Set(['creator', 'pro', 'premium', 'enterprise']);
const ACTIVE_STATES = new Set(['active', 'trialing', 'paid']);

export const normalizePlanTier = (planTier = 'free') => String(planTier || 'free').trim().toLowerCase();

export const normalizePlanState = (billing = {}) => String(
  billing?.planState || billing?.status || 'inactive',
).trim().toLowerCase();

export const isBillingActive = (billing = {}) => ACTIVE_STATES.has(normalizePlanState(billing));

export const isProTier = (billing = {}) => VOICE_ASSISTANT_ENABLED_TIERS.has(normalizePlanTier(billing?.planTier));

export const hasSpeechTranslationAccess = (billing = {}) => (
  isProTier(billing) && isBillingActive(billing) && getCreditBalance(billing) > getVoiceCreditReserve(billing)
);

export const hasVoiceAssistantAccess = (billing = {}) => {
  return hasSpeechTranslationAccess(billing);
};

export const getVoiceAssistantUpgradeMessage = (billing = {}) => {
  if (hasVoiceAssistantAccess(billing)) {
    return '';
  }

  const planLabel = String(billing?.planLabel || '').trim();
  if (planLabel && normalizePlanTier(billing?.planTier) !== 'free') {
    return `Voice conversations are available on Creator+ plans. ${planLabel} does not include talk mode.`;
  }

  return 'Voice conversations are available on Creator+ plans. Upgrade to unlock talk mode.';
};

export const isCanceledButStillActive = (billing = {}) => (
  normalizePlanState(billing) === 'active' && Boolean(billing?.cancelAtPeriodEnd)
);

export const isBillingRecoverable = (billing = {}) => {
  const planState = normalizePlanState(billing);
  if (!planState || planState === 'inactive') {
    return true;
  }
  return planState === 'past_due' || planState === 'unpaid' || planState === 'incomplete';
};

export const getBillingPlanLabel = (billing = {}) => String(
  billing?.planLabel || BILLING_PLANS[normalizePlanTier(billing?.planTier)]?.label || 'Free',
).trim();

export const getCreditBalance = (billing = {}) => Number(billing?.creditBalance || 0);

export const getIncludedCreditsMonthly = (billing = {}) => Number(
  billing?.includedCreditsMonthly || BILLING_PLANS[normalizePlanTier(billing?.planTier)]?.includedCreditsMonthly || 0,
);

export const getVoiceCreditReserve = (billing = {}) => {
  const tier = normalizePlanTier(billing?.planTier);
  if (tier === 'premium' || tier === 'enterprise') return 75;
  if (tier === 'pro') return 50;
  if (tier === 'creator') return 25;
  return 0;
};

export const isCreditDepleted = (billing = {}) => getCreditBalance(billing) <= 0;
