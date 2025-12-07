// functions/utils/limits.js
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { FieldValue } = require("firebase-admin/firestore");

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
  free: { apiCalls: 50, storageMb: 50, books: 3, pages: 150 },
  early: { apiCalls: 70, storageMb: 70, books: 4, pages: 200 },
  god: { apiCalls: 1_000_000_000, storageMb: 1_000_000_000, books: 1_000_000, pages: 1_000_000_000 },
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
    },
    early: {
      apiCalls: parseNumber(process.env.PLAN_EARLY_API_CALLS, defaultPlans.early.apiCalls),
      storageMb: parseNumber(process.env.PLAN_EARLY_STORAGE_MB, defaultPlans.early.storageMb),
      books: parseNumber(process.env.PLAN_EARLY_BOOKS, defaultPlans.early.books),
      pages: parseNumber(process.env.PLAN_EARLY_PAGES, defaultPlans.early.pages),
    },
    god: {
      apiCalls: parseNumber(process.env.PLAN_GOD_API_CALLS, defaultPlans.god.apiCalls),
      storageMb: parseNumber(process.env.PLAN_GOD_STORAGE_MB, defaultPlans.god.storageMb),
      books: parseNumber(process.env.PLAN_GOD_BOOKS, defaultPlans.god.books),
      pages: parseNumber(process.env.PLAN_GOD_PAGES, defaultPlans.god.pages),
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

  const tier = userData?.billing?.planTier;
  if (tier === "god" || tier === "early" || tier === "free") return tier;
  return "free";
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
  return withUserTransaction(db, uid, ({ tx, userRef, userData, tier, limits, now }) => {
    const current = userData.quotaCounters?.apiCalls || {};
    const windowStartMs = toMillis(current.windowStart) ?? now;
    const withinWindow = now - windowStartMs < THIRTY_DAYS_MS;
    const used = withinWindow ? current.used || 0 : 0;

    if (used + amount > limits.apiCalls) {
      throw new HttpsError("resource-exhausted", "AI monthly limit reached. Please upgrade your plan.");
    }

    const newWindowStart = withinWindow ? windowStartMs : now;
    tx.update(userRef, {
      "quotaCounters.apiCalls": {
        used: used + amount,
        windowStart: new Date(newWindowStart),
      },
      "billing.planTier": tier,
      "billing.planLabel": userData?.billing?.planLabel || tier,
    });

    return { tier, limits, used: used + amount };
  });
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
    return { tier, limits, used: next, limitBytes };
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
  buildInitialQuotaCounters,
  consumeApiCallQuota,
  assertAndIncrementCounter,
  assertStorageAllowance,
  addStorageUsage,
  THIRTY_DAYS_MS,
  defaultPlans,
};
