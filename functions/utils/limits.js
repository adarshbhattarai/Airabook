// functions/utils/limits.js
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { FieldValue } = require("firebase-admin/firestore");
const { consumeCredits, estimateTokensFromText } = require("../payments/creditLedger");
const { getPlanConfig, normalizePlanTier } = require("../payments/catalog");

// Create HttpsError compatible with both v1 and v2
class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'HttpsError';
  }
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const defaultPlans = {
  free: {
    apiCalls: 150,
    storageMb: 50,
    books: 3,
    pages: 150,
    chaptersPerBook: 15,
    pagesPerChapter: 5,
  },
  creator: {
    apiCalls: 2500,
    storageMb: 512,
    books: 25,
    pages: 5000,
    chaptersPerBook: 500,
    pagesPerChapter: 500,
  },
  pro: {
    apiCalls: 7000,
    storageMb: 2048,
    books: 100,
    pages: 20000,
    chaptersPerBook: 1000,
    pagesPerChapter: 1000,
  },
  premium: {
    apiCalls: 16000,
    storageMb: 8192,
    books: 500,
    pages: 100000,
    chaptersPerBook: 2000,
    pagesPerChapter: 2000,
  },
  god: {
    apiCalls: 1_000_000_000,
    storageMb: 1_000_000_000,
    books: 1_000_000,
    pages: 1_000_000_000,
    chaptersPerBook: 1_000_000,
    pagesPerChapter: 1_000_000,
  },
};

const parseNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const parseList = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v).toLowerCase());
  if (typeof val === "string") {
    return val
      .split(",")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
};

function loadConfig() {
  // Use process.env directly instead of functions.config()
  const plans = {
    free: {
      apiCalls: parseNumber(process.env.PLAN_FREE_API_CALLS, defaultPlans.free.apiCalls),
      storageMb: parseNumber(process.env.PLAN_FREE_STORAGE_MB, defaultPlans.free.storageMb),
      books: parseNumber(process.env.PLAN_FREE_BOOKS, defaultPlans.free.books),
      pages: parseNumber(process.env.PLAN_FREE_PAGES, defaultPlans.free.pages),
      chaptersPerBook: parseNumber(process.env.PLAN_FREE_CHAPTERS_PER_BOOK, defaultPlans.free.chaptersPerBook),
      pagesPerChapter: parseNumber(process.env.PLAN_FREE_PAGES_PER_CHAPTER, defaultPlans.free.pagesPerChapter),
    },
    creator: {
      apiCalls: parseNumber(process.env.PLAN_CREATOR_API_CALLS, defaultPlans.creator.apiCalls),
      storageMb: parseNumber(process.env.PLAN_CREATOR_STORAGE_MB, defaultPlans.creator.storageMb),
      books: parseNumber(process.env.PLAN_CREATOR_BOOKS, defaultPlans.creator.books),
      pages: parseNumber(process.env.PLAN_CREATOR_PAGES, defaultPlans.creator.pages),
      chaptersPerBook: parseNumber(process.env.PLAN_CREATOR_CHAPTERS_PER_BOOK, defaultPlans.creator.chaptersPerBook),
      pagesPerChapter: parseNumber(process.env.PLAN_CREATOR_PAGES_PER_CHAPTER, defaultPlans.creator.pagesPerChapter),
    },
    pro: {
      apiCalls: parseNumber(process.env.PLAN_PRO_API_CALLS, defaultPlans.pro.apiCalls),
      storageMb: parseNumber(process.env.PLAN_PRO_STORAGE_MB, defaultPlans.pro.storageMb),
      books: parseNumber(process.env.PLAN_PRO_BOOKS, defaultPlans.pro.books),
      pages: parseNumber(process.env.PLAN_PRO_PAGES, defaultPlans.pro.pages),
      chaptersPerBook: parseNumber(process.env.PLAN_PRO_CHAPTERS_PER_BOOK, defaultPlans.pro.chaptersPerBook),
      pagesPerChapter: parseNumber(process.env.PLAN_PRO_PAGES_PER_CHAPTER, defaultPlans.pro.pagesPerChapter),
    },
    premium: {
      apiCalls: parseNumber(process.env.PLAN_PREMIUM_API_CALLS, defaultPlans.premium.apiCalls),
      storageMb: parseNumber(process.env.PLAN_PREMIUM_STORAGE_MB, defaultPlans.premium.storageMb),
      books: parseNumber(process.env.PLAN_PREMIUM_BOOKS, defaultPlans.premium.books),
      pages: parseNumber(process.env.PLAN_PREMIUM_PAGES, defaultPlans.premium.pages),
      chaptersPerBook: parseNumber(process.env.PLAN_PREMIUM_CHAPTERS_PER_BOOK, defaultPlans.premium.chaptersPerBook),
      pagesPerChapter: parseNumber(process.env.PLAN_PREMIUM_PAGES_PER_CHAPTER, defaultPlans.premium.pagesPerChapter),
    },
    god: {
      apiCalls: parseNumber(process.env.PLAN_GOD_API_CALLS, defaultPlans.god.apiCalls),
      storageMb: parseNumber(process.env.PLAN_GOD_STORAGE_MB, defaultPlans.god.storageMb),
      books: parseNumber(process.env.PLAN_GOD_BOOKS, defaultPlans.god.books),
      pages: parseNumber(process.env.PLAN_GOD_PAGES, defaultPlans.god.pages),
      chaptersPerBook: parseNumber(process.env.PLAN_GOD_CHAPTERS_PER_BOOK, defaultPlans.god.chaptersPerBook),
      pagesPerChapter: parseNumber(process.env.PLAN_GOD_PAGES_PER_CHAPTER, defaultPlans.god.pagesPerChapter),
    },
  };

  return {
    plans,
    godUsers: new Set(parseList(process.env.GOD_USERS)),
  };
}

function tierForUser(userData, uid, cfg = loadConfig()) {
  const email = (userData?.email || "").toLowerCase();
  if (cfg.godUsers.has(email) || cfg.godUsers.has(uid)) return "god";

  const tier = normalizePlanTier(userData?.billing?.planTier || 'free');
  if (tier === "god" || tier === "creator" || tier === "pro" || tier === "premium" || tier === "free") return tier;
  return "free";
}

async function resolveUserPlanLimits(db, uid) {
  const cfg = loadConfig();
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  const userData = snap.exists ? (snap.data() || {}) : {};
  const tier = tierForUser(userData, uid, cfg);
  const limits = cfg.plans[tier] || defaultPlans.free;
  return { tier, limits, userData, userExists: snap.exists };
}

function toMillis(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  return null;
}



function buildInitialQuotaCounters() {
  return {
    apiCalls: {
      used: 0,
      windowStart: FieldValue.serverTimestamp(),
    },
    storageBytesUsed: 0,
    lastStorageCreditChargeAt: null,
    books: 0,
    pages: 0,
  };
}

async function withUserTransaction(db, uid, handler) {
  const cfg = loadConfig();
  const userRef = db.collection("users").doc(uid);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "User profile not found.");
    }
    const userData = snap.data() || {};
    const tier = tierForUser(userData, uid, cfg);
    const limits = cfg.plans[tier] || defaultPlans.free;
    return handler({ tx, userRef, userData, tier, limits, now });
  });
}

async function consumeApiCallQuota(db, uid, amount = 1) {
  const previewText = 'x'.repeat(Math.max(1, amount) * 250);
  try {
    return await consumeCredits(db, uid, {
      feature: 'ai_text',
      source: 'legacy_api_call_quota',
      provider: 'functions',
      rawUnits: {
        inputText: previewText,
        outputText: previewText,
        inputTokens: estimateTokensFromText(previewText),
        outputTokens: estimateTokensFromText(previewText),
      },
      minimumCredits: Math.max(1, amount),
    });
  } catch (error) {
    if (error?.code === 'resource-exhausted') {
      throw new HttpsError('resource-exhausted', 'Credits exhausted. Please upgrade or buy a credit pack.');
    }
    throw error;
  }
}

async function assertAndIncrementCounter(db, uid, counterKey, amount, limitValue, errorMessage) {
  return withUserTransaction(db, uid, ({ tx, userRef, userData, tier, limits }) => {
    if (tier === "god") return { tier, limits, skipped: true };

    const qc = userData.quotaCounters || {};
    const current = qc[counterKey] || 0;
    const next = Math.max(0, current + amount);
    const effectiveLimit = limitValue ?? limits[counterKey] ?? Number.MAX_SAFE_INTEGER;
    if (amount > 0 && next > effectiveLimit) {
      throw new HttpsError("resource-exhausted", errorMessage || "Limit reached.");
    }
    tx.update(userRef, { [`quotaCounters.${counterKey}`]: next });
    return { tier, limits, value: next };
  });
}

async function addStorageUsage(db, uid, deltaBytes) {
  return withUserTransaction(db, uid, ({ tx, userRef, userData, tier, limits }) => {
    const limitBytes = (limits.storageMb || 0) * 1024 * 1024;
    const current = userData.quotaCounters?.storageBytesUsed || 0;
    const next = Math.max(0, current + deltaBytes);

    if (deltaBytes > 0 && tier !== "god" && next > limitBytes) {
      throw new HttpsError("resource-exhausted", "Storage limit reached. Please upgrade your plan.");
    }

    tx.update(userRef, { "quotaCounters.storageBytesUsed": next });
    return { tier, limits, before: current, after: next, deltaBytes, limitBytes };
  });
}

async function assertStorageAllowance(db, uid, incomingBytes) {
  const result = await withUserTransaction(db, uid, ({ userData, tier, limits }) => {
    if (tier === "god") return { tier, limits, allowed: true };
    const limitBytes = (limits.storageMb || 0) * 1024 * 1024;
    const current = userData.quotaCounters?.storageBytesUsed || 0;
    if (current + incomingBytes > limitBytes) {
      throw new HttpsError("resource-exhausted", "Storage limit reached. Please upgrade your plan.");
    }
    return { tier, limits, allowed: true };
  });
  return result;
}

module.exports = {
  loadConfig,
  tierForUser,
  resolveUserPlanLimits,
  buildInitialQuotaCounters,
  estimateTokensFromText,
  consumeApiCallQuota,
  assertAndIncrementCounter,
  assertStorageAllowance,
  addStorageUsage,
  THIRTY_DAYS_MS,
  defaultPlans,
};
