const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const {
  ACTIVE_PLAN_STATES,
  getPlanConfig,
  normalizePlanState,
  normalizePlanTier,
} = require('./catalog');

const USERS_COLLECTION = 'users';
const USAGE_EVENTS_COLLECTION = 'usageEvents';
const PRICING_CATALOG_DOC = 'pricingCatalog/current';

const DEFAULT_PRICING_CATALOG = {
  version: '2026-03-16',
  safetyMultiplier: 1.35,
  creditsPerUsd: 500,
  reserveThresholds: {
    voice: 25,
    ai: 10,
  },
  tokenPricing: {
    inputUsdPer1k: 0.0002,
    outputUsdPer1k: 0.0008,
  },
  sttPricing: {
    usdPerSecond: 0.00027,
  },
  ttsPricing: {
    usdPerCharacter: 0.000015,
  },
  imagePricing: {
    outputUsdPer1k: 0.03,
    defaultOutputTokens: 1290,
  },
  storagePricing: {
    usdPerGbDay: 0.00077,
  },
  lowCreditFloor: 25,
  shadowMode: false,
};

const asNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value?.toDate === 'function') {
    return Timestamp.fromDate(value.toDate());
  }
  if (typeof value === 'number') return Timestamp.fromMillis(value);
  if (value instanceof Date) return Timestamp.fromDate(value);
  return null;
};

const estimateTokensFromText = (value = '') => {
  if (!value) return 0;
  return Math.max(1, Math.ceil(String(value).length / 4));
};

const currentMonthKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `month:${year}-${month}`;
};

const subscriptionGrantKey = (billing = {}, now = new Date()) => {
  const periodEnd = toTimestamp(billing?.currentPeriodEnd);
  if (periodEnd) {
    return `sub:${periodEnd.toMillis()}`;
  }
  return currentMonthKey(now);
};

const buildCreditFields = (planTier = 'free', existingBilling = {}, { initialGrant = true } = {}) => {
  const config = getPlanConfig(planTier);
  const existingBalance = asNumber(existingBilling.creditBalance, NaN);
  const existingPurchased = asNumber(existingBilling.purchasedCredits, 0);
  const hasExistingBalance = Number.isFinite(existingBalance);

  return {
    includedCreditsMonthly: config.includedCreditsMonthly,
    rolloverCap: config.rolloverCap,
    creditBalance: hasExistingBalance ? existingBalance : (initialGrant ? config.includedCreditsMonthly : 0),
    rolloverCredits: asNumber(existingBilling.rolloverCredits, 0),
    purchasedCredits: existingPurchased,
    usedCreditsThisCycle: asNumber(existingBilling.usedCreditsThisCycle, 0),
    lastCreditGrantAt: existingBilling.lastCreditGrantAt || (initialGrant ? FieldValue.serverTimestamp() : null),
    lastCreditGrantPeriod: existingBilling.lastCreditGrantPeriod || (initialGrant ? currentMonthKey() : null),
    lowCreditState: Boolean(existingBilling.lowCreditState) || (!hasExistingBalance && config.includedCreditsMonthly <= DEFAULT_PRICING_CATALOG.lowCreditFloor),
  };
};

const mergePricingCatalog = (docData = {}) => {
  return {
    ...DEFAULT_PRICING_CATALOG,
    ...docData,
    reserveThresholds: {
      ...DEFAULT_PRICING_CATALOG.reserveThresholds,
      ...(docData.reserveThresholds || {}),
    },
    tokenPricing: {
      ...DEFAULT_PRICING_CATALOG.tokenPricing,
      ...(docData.tokenPricing || {}),
    },
    sttPricing: {
      ...DEFAULT_PRICING_CATALOG.sttPricing,
      ...(docData.sttPricing || {}),
    },
    ttsPricing: {
      ...DEFAULT_PRICING_CATALOG.ttsPricing,
      ...(docData.ttsPricing || {}),
    },
    imagePricing: {
      ...DEFAULT_PRICING_CATALOG.imagePricing,
      ...(docData.imagePricing || {}),
    },
    storagePricing: {
      ...DEFAULT_PRICING_CATALOG.storagePricing,
      ...(docData.storagePricing || {}),
    },
  };
};

const getPricingCatalog = async (db = admin.firestore()) => {
  try {
    const snapshot = await db.doc(PRICING_CATALOG_DOC).get();
    if (!snapshot.exists) {
      return mergePricingCatalog();
    }
    return mergePricingCatalog(snapshot.data() || {});
  } catch (_) {
    return mergePricingCatalog();
  }
};

const buildUsageCharge = (usage = {}, pricingCatalog = DEFAULT_PRICING_CATALOG) => {
  const feature = String(usage.feature || 'generic').trim().toLowerCase();
  const rawUnits = usage.rawUnits || {};
  let estimatedCostUsd = asNumber(usage.estimatedCostUsd, NaN);

  if (!Number.isFinite(estimatedCostUsd)) {
    switch (feature) {
      case 'rewrite':
      case 'book_query':
      case 'chapter_suggestions':
      case 'page_draft':
      case 'chat':
      case 'planner':
      case 'ai_text': {
        const inputTokens = asNumber(rawUnits.inputTokens, estimateTokensFromText(rawUnits.inputText));
        const outputTokens = asNumber(rawUnits.outputTokens, estimateTokensFromText(rawUnits.outputText));
        estimatedCostUsd =
          (inputTokens / 1000) * pricingCatalog.tokenPricing.inputUsdPer1k +
          (outputTokens / 1000) * pricingCatalog.tokenPricing.outputUsdPer1k;
        break;
      }
      case 'voice_stt': {
        estimatedCostUsd = asNumber(rawUnits.seconds, 0) * pricingCatalog.sttPricing.usdPerSecond;
        break;
      }
      case 'voice_tts': {
        estimatedCostUsd = asNumber(rawUnits.characters, 0) * pricingCatalog.ttsPricing.usdPerCharacter;
        break;
      }
      case 'image_generation': {
        const inputTokens = asNumber(rawUnits.inputTokens, estimateTokensFromText(rawUnits.inputText));
        const outputImageTokens = asNumber(
          rawUnits.outputImageTokens,
          pricingCatalog.imagePricing.defaultOutputTokens,
        );
        estimatedCostUsd =
          (inputTokens / 1000) * pricingCatalog.tokenPricing.inputUsdPer1k +
          (outputImageTokens / 1000) * pricingCatalog.imagePricing.outputUsdPer1k;
        break;
      }
      case 'storage_retention': {
        estimatedCostUsd = asNumber(rawUnits.gbDays, 0) * pricingCatalog.storagePricing.usdPerGbDay;
        break;
      }
      default: {
        estimatedCostUsd = asNumber(rawUnits.usd, 0);
      }
    }
  }

  const creditsCharged = Math.max(
    asNumber(usage.minimumCredits, 0),
    Math.ceil(Math.max(0, estimatedCostUsd) * pricingCatalog.safetyMultiplier * pricingCatalog.creditsPerUsd),
  );

  return {
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
    creditsCharged,
  };
};

const shouldGrantCredits = (billing = {}, now = new Date()) => {
  const tier = normalizePlanTier(billing?.planTier);
  const periodKey = tier === 'free' || tier === 'supporter'
    ? currentMonthKey(now)
    : subscriptionGrantKey(billing, now);
  return {
    shouldGrant: billing?.lastCreditGrantPeriod !== periodKey,
    periodKey,
    tier,
  };
};

const applyGrantToBilling = (billing = {}, now = new Date()) => {
  const config = getPlanConfig(billing?.planTier || 'free');
  const { shouldGrant, periodKey } = shouldGrantCredits(billing, now);
  const purchasedCredits = asNumber(billing?.purchasedCredits, 0);
  const currentBalance = asNumber(billing?.creditBalance, 0);
  const rolloverBase = Math.max(0, currentBalance - purchasedCredits);
  const rolloverCredits = shouldGrant ? Math.min(rolloverBase, config.rolloverCap) : asNumber(billing?.rolloverCredits, 0);
  const creditBalance = shouldGrant
    ? purchasedCredits + rolloverCredits + config.includedCreditsMonthly
    : currentBalance;

  return {
    ...billing,
    includedCreditsMonthly: config.includedCreditsMonthly,
    rolloverCap: config.rolloverCap,
    rolloverCredits,
    creditBalance,
    usedCreditsThisCycle: shouldGrant ? 0 : asNumber(billing?.usedCreditsThisCycle, 0),
    lastCreditGrantAt: shouldGrant ? Timestamp.fromDate(now) : toTimestamp(billing?.lastCreditGrantAt),
    lastCreditGrantPeriod: shouldGrant ? periodKey : billing?.lastCreditGrantPeriod || periodKey,
    lowCreditState: creditBalance <= Math.max(DEFAULT_PRICING_CATALOG.lowCreditFloor, config.hardCreditReserve || 0),
  };
};

const ensureMonthlyCreditsForUser = async (userId, db = admin.firestore()) => {
  if (!userId) return null;
  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      return null;
    }
    const userData = snapshot.data() || {};
    const currentBilling = userData.billing || {};
    const nextBilling = applyGrantToBilling(currentBilling);
    if (nextBilling.lastCreditGrantPeriod !== currentBilling.lastCreditGrantPeriod) {
      tx.update(userRef, {
        'billing.includedCreditsMonthly': nextBilling.includedCreditsMonthly,
        'billing.rolloverCap': nextBilling.rolloverCap,
        'billing.rolloverCredits': nextBilling.rolloverCredits,
        'billing.creditBalance': nextBilling.creditBalance,
        'billing.usedCreditsThisCycle': nextBilling.usedCreditsThisCycle,
        'billing.lastCreditGrantAt': nextBilling.lastCreditGrantAt,
        'billing.lastCreditGrantPeriod': nextBilling.lastCreditGrantPeriod,
        'billing.lowCreditState': nextBilling.lowCreditState,
      });
    }
    return nextBilling;
  });
};

const consumeCredits = async (db, userId, usage = {}, options = {}) => {
  if (!db) {
    throw new Error('consumeCredits requires a Firestore instance.');
  }
  if (!userId) {
    throw new Error('consumeCredits requires a userId.');
  }

  const pricingCatalog = await getPricingCatalog(db);
  const preview = buildUsageCharge(usage, pricingCatalog);
  const enforce = options.enforce !== false;
  const allowNegative = options.allowNegative === true;
  const shadowOnly = options.shadowOnly === true || pricingCatalog.shadowMode === true;
  const now = new Date();
  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  const usageRef = db.collection(USAGE_EVENTS_COLLECTION).doc();

  return db.runTransaction(async (tx) => {
    const userSnapshot = await tx.get(userRef);
    if (!userSnapshot.exists) {
      throw new Error(`User ${userId} was not found for credit consumption.`);
    }

    const userData = userSnapshot.data() || {};
    const baseBilling = applyGrantToBilling(userData.billing || {}, now);
    const currentBalance = asNumber(baseBilling.creditBalance, 0);
    const hardReserve = getPlanConfig(baseBilling.planTier).hardCreditReserve || 0;
    const availableForSpend = Math.max(0, currentBalance - hardReserve);

    if (enforce && !shadowOnly && preview.creditsCharged > availableForSpend) {
      const error = new Error('Insufficient credits for this action.');
      error.code = 'resource-exhausted';
      throw error;
    }

    const nextBalance = shadowOnly
      ? currentBalance
      : Math.max(allowNegative ? currentBalance - preview.creditsCharged : 0, currentBalance - preview.creditsCharged);
    const actuallyDeducted = shadowOnly ? 0 : Math.min(currentBalance, preview.creditsCharged);
    const nextUsedCredits = asNumber(baseBilling.usedCreditsThisCycle, 0) + preview.creditsCharged;
    const lowCreditFloor = Math.max(DEFAULT_PRICING_CATALOG.lowCreditFloor, hardReserve);

    tx.update(userRef, {
      'billing.includedCreditsMonthly': baseBilling.includedCreditsMonthly,
      'billing.rolloverCap': baseBilling.rolloverCap,
      'billing.rolloverCredits': baseBilling.rolloverCredits,
      'billing.creditBalance': nextBalance,
      'billing.usedCreditsThisCycle': nextUsedCredits,
      'billing.lastCreditGrantAt': baseBilling.lastCreditGrantAt,
      'billing.lastCreditGrantPeriod': baseBilling.lastCreditGrantPeriod,
      'billing.lowCreditState': nextBalance <= lowCreditFloor,
      'quotaCounters.apiCalls.used': FieldValue.increment(1),
      'quotaCounters.apiCalls.windowStart': baseBilling.lastCreditGrantAt || FieldValue.serverTimestamp(),
    });

    tx.set(usageRef, {
      userId,
      feature: usage.feature || 'generic',
      source: usage.source || 'unknown',
      provider: usage.provider || 'unknown',
      rawUnits: usage.rawUnits || {},
      estimatedCostUsd: preview.estimatedCostUsd,
      creditsCharged: preview.creditsCharged,
      creditsDeducted: actuallyDeducted,
      enforceApplied: enforce && !shadowOnly,
      requestId: usage.requestId || usageRef.id,
      metadata: usage.metadata || {},
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ...preview,
      creditBalance: nextBalance,
      lowCreditState: nextBalance <= lowCreditFloor,
      usageEventId: usageRef.id,
    };
  });
};

const addPurchasedCredits = async (userId, credits, db = admin.firestore()) => {
  if (!userId || !credits) return null;
  const userRef = db.collection(USERS_COLLECTION).doc(userId);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(userRef);
    if (!snapshot.exists) {
      throw new Error(`User ${userId} not found while adding purchased credits.`);
    }

    const userData = snapshot.data() || {};
    const billing = applyGrantToBilling(userData.billing || {});
    const nextPurchasedCredits = asNumber(billing.purchasedCredits, 0) + credits;
    const nextCreditBalance = asNumber(billing.creditBalance, 0) + credits;

    tx.update(userRef, {
      'billing.includedCreditsMonthly': billing.includedCreditsMonthly,
      'billing.rolloverCap': billing.rolloverCap,
      'billing.rolloverCredits': billing.rolloverCredits,
      'billing.creditBalance': nextCreditBalance,
      'billing.purchasedCredits': nextPurchasedCredits,
      'billing.lastCreditGrantAt': billing.lastCreditGrantAt || FieldValue.serverTimestamp(),
      'billing.lastCreditGrantPeriod': billing.lastCreditGrantPeriod || currentMonthKey(),
      'billing.lowCreditState': nextCreditBalance <= DEFAULT_PRICING_CATALOG.lowCreditFloor,
    });

    return {
      creditBalance: nextCreditBalance,
      purchasedCredits: nextPurchasedCredits,
    };
  });
};

module.exports = {
  DEFAULT_PRICING_CATALOG,
  addPurchasedCredits,
  applyGrantToBilling,
  buildCreditFields,
  buildUsageCharge,
  consumeCredits,
  currentMonthKey,
  ensureMonthlyCreditsForUser,
  estimateTokensFromText,
  getPricingCatalog,
};
