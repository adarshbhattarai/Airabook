/**
 * Dynamic configuration for Firebase Functions
 * Automatically detects the current project and environment
 */

// Get current project ID from environment
// GCLOUD_PROJECT is set automatically by Firebase Functions
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'airabook-dev';

// Derive other configuration from project ID
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;
const REGION = 'us-central1';

// Determine environment based on project ID
let ENVIRONMENT = 'development';
if (PROJECT_ID.includes('-prod')) {
  ENVIRONMENT = 'production';
} else if (PROJECT_ID.includes('-qa') || PROJECT_ID.includes('-stage')) {
  ENVIRONMENT = 'staging';
} else if (PROJECT_ID.includes('-dev')) {
  ENVIRONMENT = 'development';
}

// Check if running in emulator
const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true' || 
                    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
                    process.env.FIRESTORE_EMULATOR_HOST;

const config = {
  PROJECT_ID,
  STORAGE_BUCKET,
  REGION,
  ENVIRONMENT,
  IS_EMULATOR,
};

// Log configuration on module load
console.log('🔧 Firebase Functions Configuration:');
console.log(`   Project ID: ${PROJECT_ID}`);
console.log(`   Storage Bucket: ${STORAGE_BUCKET}`);
console.log(`   Region: ${REGION}`);
console.log(`   Environment: ${ENVIRONMENT}`);
console.log(`   Is Emulator: ${IS_EMULATOR}`);

module.exports = config;

