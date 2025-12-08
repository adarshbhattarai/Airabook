/**
 * strict CORS configuration for Cloud Functions.
 * 
 * Logic:
 * 1. Emulator/Local: Allow ALL (true) to support localhost:5173, localhost:5000, etc.
 * 2. Production: Allow only specific domains:
 *    - *.airabook.com
 *    - *.airabhattarai.com
 *    - The specific Firebase Hosting domain for the current project (e.g. airabook-dev.web.app)
 */

const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

// Construct the allowed origins list for Production
const allowedOrigins = [
    // Regex for main domains and subdomains
    /\.airabook\.com$/,       // Matches airabook.com, go.airabook.com, www.airabook.com
    /\.airabhattarai\.com$/,  // Matches airabhattarai.com, etc.
];

// Add the current project's web.app domain dynamically if project ID is available
if (projectId) {
    allowedOrigins.push(`https://${projectId}.web.app`);
    allowedOrigins.push(`https://${projectId}.firebaseapp.com`); // Also allow firebaseapp.com just in case
}

// Export the configuration
// If emulator, return true (allow all).
// If production, return the specific array/regex.
exports.corsOptions = isEmulator ? true : allowedOrigins;
