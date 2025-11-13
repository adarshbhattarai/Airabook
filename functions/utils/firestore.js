const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { FieldValue } = require("firebase-admin/firestore");

function parseFirebaseConfig() {
  try {
    if (process.env.FIREBASE_CONFIG) {
      return JSON.parse(process.env.FIREBASE_CONFIG);
    }
    return {};
  } catch (error) {
    logger.warn("⚠️ Failed to parse FIREBASE_CONFIG:", error?.message);
    return {};
  }
}

function getProjectId(app = admin.app()) {
  const firebaseConfig = parseFirebaseConfig();
  const sources = [];

  if (app?.options?.projectId) {
    sources.push("admin.app().options.projectId");
  }
  if (firebaseConfig.projectId) {
    sources.push("process.env.FIREBASE_CONFIG");
  }
  if (process.env.GCLOUD_PROJECT) {
    sources.push("process.env.GCLOUD_PROJECT");
  }
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    sources.push("process.env.GOOGLE_CLOUD_PROJECT");
  }

  const projectId =
    app?.options?.projectId ||
    firebaseConfig.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    "";

  logger.log(
    `🔎 Project ID resolved as "${projectId || "unknown"}" from: ${
      sources.length ? sources.join(", ") : "no available sources"
    }`
  );

  return projectId;
}

function isDevEnvironment(projectId) {
  const normalizedProjectId = (projectId || "").toLowerCase();
  const runningInEmulator = process.env.FUNCTIONS_EMULATOR === "true";

  if (runningInEmulator) {
    return true;
  }

  const explicitDevIds = new Set(["airaproject-f5298"]);

  if (explicitDevIds.has(normalizedProjectId)) {
    return true;
  }

  return normalizedProjectId.endsWith("-dev");
}

function resolveDatabaseId({ overrideDatabaseId, projectId }) {
  if (overrideDatabaseId) {
    return overrideDatabaseId;
  }

  if (process.env.FIRESTORE_DATABASE_ID) {
    return process.env.FIRESTORE_DATABASE_ID;
  }

  return isDevEnvironment(projectId) ? "airabook" : "(default)";
}

const firestoreCache = new Map();

function getFirestore(options = {}) {
  const {
    databaseId: overrideDatabaseId,
    forceRefresh = false,
    remember = false,
  } = options;
  const cacheKey = overrideDatabaseId || "__auto__";

  if (!forceRefresh && firestoreCache.has(cacheKey)) {
    return firestoreCache.get(cacheKey);
  }

  const app = admin.app();
  const projectId = getProjectId(app);
  const requestedDatabaseId = resolveDatabaseId({
    overrideDatabaseId,
    projectId,
  });

  const useDefault = !requestedDatabaseId || requestedDatabaseId === "(default)";
  const db = useDefault
    ? admin.firestore(app)
    : admin.firestore(app, requestedDatabaseId);

  const resolvedDatabaseId = db?._databaseId?.database || "(default)";

  logger.log(
    `🔍 Firestore requested database: ${requestedDatabaseId || "(default)"}`
  );
  logger.log(`🔍 Firestore project: ${projectId || "unknown"}`);

  if (
    resolvedDatabaseId !== requestedDatabaseId &&
    !(requestedDatabaseId === "(default)" && !resolvedDatabaseId)
  ) {
    logger.warn(
      `⚠️ Firestore SDK reported database "${resolvedDatabaseId}" which differs from requested "${requestedDatabaseId}"`
    );
  } else {
    logger.log(`ℹ️ Firestore SDK connected to database: ${resolvedDatabaseId}`);
  }

  const info = {
    db,
    databaseId: requestedDatabaseId || "(default)",
    resolvedDatabaseId,
    projectId,
    isDev: isDevEnvironment(projectId),
  };

  firestoreCache.set(cacheKey, info);
  if (remember) {
    firestoreCache.set("__auto__", info);
  }
  return info;
}

module.exports = {
  getFirestore,
  FieldValue,
  getProjectId,
  isDevEnvironment,
};
