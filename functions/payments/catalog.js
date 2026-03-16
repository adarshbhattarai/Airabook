const ACTIVE_PLAN_STATES = new Set(['active', 'trialing', 'paid']);
const VOICE_ENABLED_TIERS = new Set(['creator', 'pro', 'premium', 'enterprise']);

const BASE_ENTITLEMENTS = {
  canReadBooks: true,
  canWriteBooks: true,
  canInviteTeam: false,
};

const PLAN_CONFIG = {
  free: {
    label: 'Free',
    priceMonthlyCents: 0,
    includedCreditsMonthly: 150,
    rolloverCap: 0,
    storageMb: 50,
    hardCreditReserve: 0,
    entitlements: {
      ...BASE_ENTITLEMENTS,
    },
  },
  supporter: {
    label: 'Supporter',
    priceMonthlyCents: 300,
    includedCreditsMonthly: 150,
    rolloverCap: 0,
    storageMb: 50,
    hardCreditReserve: 0,
    entitlements: {
      ...BASE_ENTITLEMENTS,
    },
  },
  creator: {
    label: 'Creator',
    priceMonthlyCents: 700,
    includedCreditsMonthly: 2500,
    rolloverCap: 625,
    storageMb: 512,
    hardCreditReserve: 25,
    entitlements: {
      ...BASE_ENTITLEMENTS,
      canInviteTeam: true,
      canUseVoiceAssistant: true,
      canUseSpeechTranslation: true,
    },
  },
  pro: {
    label: 'Pro',
    priceMonthlyCents: 1500,
    includedCreditsMonthly: 7000,
    rolloverCap: 1750,
    storageMb: 2048,
    hardCreditReserve: 50,
    entitlements: {
      ...BASE_ENTITLEMENTS,
      canInviteTeam: true,
      canUseVoiceAssistant: true,
      canUseSpeechTranslation: true,
      canUsePriorityQueue: true,
    },
  },
  premium: {
    label: 'Premium',
    priceMonthlyCents: 2500,
    includedCreditsMonthly: 16000,
    rolloverCap: 4000,
    storageMb: 8192,
    hardCreditReserve: 75,
    entitlements: {
      ...BASE_ENTITLEMENTS,
      canInviteTeam: true,
      canUseVoiceAssistant: true,
      canUseSpeechTranslation: true,
      canUsePriorityQueue: true,
      prioritySupport: true,
    },
  },
  enterprise: {
    label: 'Enterprise',
    priceMonthlyCents: 0,
    includedCreditsMonthly: 100000,
    rolloverCap: 25000,
    storageMb: 51200,
    hardCreditReserve: 100,
    entitlements: {
      ...BASE_ENTITLEMENTS,
      canInviteTeam: true,
      canUseVoiceAssistant: true,
      canUseSpeechTranslation: true,
      canUsePriorityQueue: true,
      prioritySupport: true,
      canManageTeam: true,
    },
  },
};

const CREDIT_PACKS = {
  pack_1000: {
    id: 'pack_1000',
    label: 'Starter Credit Pack',
    credits: 1000,
    amountCents: 500,
  },
  pack_2750: {
    id: 'pack_2750',
    label: 'Creator Credit Pack',
    credits: 2750,
    amountCents: 1200,
  },
  pack_5000: {
    id: 'pack_5000',
    label: 'Pro Credit Pack',
    credits: 5000,
    amountCents: 2000,
  },
};

const normalizePlanTier = (value = 'free') => {
  const normalized = String(value || 'free').trim().toLowerCase();
  if (normalized === 'god') return 'enterprise';
  if (normalized === 'early') return 'creator';
  return PLAN_CONFIG[normalized] ? normalized : 'free';
};

const normalizePlanState = (value = 'inactive') => {
  const normalized = String(value || 'inactive').trim().toLowerCase();
  return normalized || 'inactive';
};

const getPlanConfig = (planTier = 'free') => PLAN_CONFIG[normalizePlanTier(planTier)] || PLAN_CONFIG.free;

const getCreditPackConfig = (packId) => CREDIT_PACKS[String(packId || '').trim()] || null;

const isVoiceTier = (planTier = 'free') => VOICE_ENABLED_TIERS.has(normalizePlanTier(planTier));

module.exports = {
  ACTIVE_PLAN_STATES,
  CREDIT_PACKS,
  PLAN_CONFIG,
  VOICE_ENABLED_TIERS,
  getCreditPackConfig,
  getPlanConfig,
  isVoiceTier,
  normalizePlanState,
  normalizePlanTier,
};
