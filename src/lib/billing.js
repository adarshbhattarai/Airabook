const VOICE_ASSISTANT_ENABLED_TIERS = new Set(['pro', 'enterprise']);

export const normalizePlanTier = (planTier = 'free') => String(planTier || 'free').trim().toLowerCase();

export const normalizePlanState = (billing = {}) => String(
  billing?.planState || billing?.status || 'inactive',
).trim().toLowerCase();

export const hasVoiceAssistantAccess = (billing = {}) => {
  const planTier = normalizePlanTier(billing?.planTier);
  if (!VOICE_ASSISTANT_ENABLED_TIERS.has(planTier)) {
    return false;
  }

  const planState = normalizePlanState(billing);
  return planState === 'active' || planState === 'trialing' || planState === 'paid';
};

export const getVoiceAssistantUpgradeMessage = (billing = {}) => {
  if (hasVoiceAssistantAccess(billing)) {
    return '';
  }

  const planLabel = String(billing?.planLabel || '').trim();
  if (planLabel && normalizePlanTier(billing?.planTier) !== 'free') {
    return `Voice conversations are available on Pro+ plans. ${planLabel} does not include talk mode.`;
  }

  return 'Voice conversations are available on Pro+ plans. Upgrade to unlock talk mode.';
};
