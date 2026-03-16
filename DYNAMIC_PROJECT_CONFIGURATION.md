# Dynamic Project Configuration Guide

This project now uses **dynamic configuration** that automatically adapts to different environments (dev, staging, production) without hardcoding project IDs.

## 🎯 Benefits

1. **Single Codebase** - No need to change code when deploying to different environments
2. **Automatic Detection** - Firebase automatically provides the current project ID
3. **Easy Multi-Environment** - Deploy to dev, qa, staging, and prod with the same code
4. **Prevents Errors** - No more mismatched project IDs between frontend and backend

---

## 🔧 How It Works

### Automatic Environment Variables

When Firebase Functions deploy, they automatically set these environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `GCLOUD_PROJECT` | Current Google Cloud Project ID | `airabook-dev` |
| `GCP_PROJECT` | Alternative name for the same | `airabook-dev` |

### Dynamic Configuration

All functions now detect the project ID automatically:

```javascript
// Before (hardcoded) ❌
const PROJECT_ID = 'airabook-dev';
const STORAGE_BUCKET = 'airabook-dev.firebasestorage.app';

// After (dynamic) ✅
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'airabook-dev';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;
```

---

## 📁 Updated Files

### Core Functions
- ✅ `functions/config.js` - Centralized configuration module (NEW)
- ✅ `functions/index.js` - Main functions entry point
- ✅ `functions/createBook.js` - Book creation function
- ✅ `functions/mediaProcessor.js` - Media upload/delete handlers
- ✅ `functions/utils/aiClient.js` - AI/Vertex AI client

### Test/Utility Scripts
- ✅ `functions/test-auth.cjs` - Authentication testing
- ✅ `functions/seedData.js` - Data seeding script
- ✅ `functions/create-emulator-user.cjs` - Emulator user creation

---

## 🚀 Deployment to Different Environments

### Development Environment
```bash
firebase deploy --only functions --project dev
```
Result: Functions use `airabook-dev` project

### QA/Staging Environment
```bash
firebase deploy --only functions --project qa
```
Result: Functions use `airabook-qa` project

### Production Environment
```bash
firebase deploy --only functions --project prod
```
Result: Functions use `airabook-prod` project

---

## 📦 Using the Config Module

You can use the centralized config module in any function:

```javascript
const config = require('./config');

console.log(`Current project: ${config.PROJECT_ID}`);
console.log(`Storage bucket: ${config.STORAGE_BUCKET}`);
console.log(`Environment: ${config.ENVIRONMENT}`);
console.log(`Is Emulator: ${config.IS_EMULATOR}`);
```

### Available Config Properties

```javascript
{
  PROJECT_ID: 'airabook-dev',           // Current project ID
  STORAGE_BUCKET: 'airabook-dev.firebasestorage.app',  // Storage bucket
  REGION: 'us-central1',                 // Function region
  ENVIRONMENT: 'development',            // Environment type
  IS_EMULATOR: false                     // Running in emulator?
}
```

---

## 🔍 Environment Detection

The configuration automatically detects the environment based on project ID:

| Project ID Pattern | Detected Environment |
|-------------------|---------------------|
| `*-prod` | `production` |
| `*-qa`, `*-stage` | `staging` |
| `*-dev` | `development` |
| Others | `development` |

---

## 🧪 Testing Locally

When running locally with emulators, the config uses default values:

```bash
# Start emulators
npm run emulators

# Run test scripts (uses dynamic config)
npm run test:auth
npm run seed:data
```

The scripts will automatically use:
- Emulator mode: `demo-project`
- With Firebase: Current Firebase project

---

## ✅ Verification

After deployment, check the logs to verify configuration:

```bash
firebase functions:log --project dev
```

Look for these log messages:
```
🔧 Initializing Firebase Admin for project: airabook-dev
📦 Storage bucket: airabook-dev.firebasestorage.app
🤖 AI Client initialized for project: airabook-dev
```

---

## 🎓 Best Practices

1. **Never hardcode project IDs** - Always use `process.env.GCLOUD_PROJECT`
2. **Use config.js** - Import the centralized config module when possible
3. **Log configuration** - Log project details on initialization for debugging
4. **Test in all environments** - Verify deployment in dev before prod
5. **Keep fallbacks** - Always provide a default value for local development

---

## 🔄 Migration from Hardcoded Values

If you need to add a new function or module:

### ❌ Don't Do This
```javascript
admin.initializeApp({
  storageBucket: "airabook-dev.firebasestorage.app", // Hardcoded!
});
```

### ✅ Do This Instead
```javascript
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'airabook-dev';
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

admin.initializeApp({
  storageBucket: STORAGE_BUCKET,
});
```

### ✅ Or Even Better
```javascript
const config = require('./config');

admin.initializeApp({
  storageBucket: config.STORAGE_BUCKET,
});
```

---

## 📞 Frontend Configuration

The frontend also needs dynamic configuration. Use `.env.development`, `.env.qa`, `.env.production`:

```bash
# .env.development
VITE_FIREBASE_PROJECT_ID=airabook-dev
VITE_FIREBASE_STORAGE_BUCKET=airabook-dev.firebasestorage.app

# .env.qa  
VITE_FIREBASE_PROJECT_ID=airabook-qa
VITE_FIREBASE_STORAGE_BUCKET=airabook-qa.appspot.com

# .env.production
VITE_FIREBASE_PROJECT_ID=airabook-prod
VITE_FIREBASE_STORAGE_BUCKET=airabook-prod.appspot.com
```

Build commands automatically use the correct environment:
```bash
npm run build:dev    # Uses .env.development
npm run build:qa     # Uses .env.qa
npm run build:prod   # Uses .env.production
```

---

## 🐛 Troubleshooting

### Issue: Token validation fails
**Error:** `Firebase ID token has incorrect "aud" claim`

**Cause:** Frontend and backend using different project IDs

**Solution:** 
1. Rebuild frontend: `npm run build:dev`
2. Redeploy functions: `firebase deploy --only functions --project dev`
3. Verify both use same project in logs

### Issue: Storage bucket not found
**Error:** `The specified bucket does not exist`

**Cause:** Bucket name doesn't match project

**Solution:** Ensure storage bucket follows pattern: `{project-id}.appspot.com`

---

## 📚 Additional Resources

- [Firebase Environment Configuration](https://firebase.google.com/docs/functions/config-env)
- [Google Cloud Project IDs](https://cloud.google.com/resource-manager/docs/creating-managing-projects)
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)

---

## 🎉 Summary

Your Firebase Functions now automatically adapt to any environment:

✅ No more hardcoded project IDs  
✅ Single codebase for all environments  
✅ Automatic project detection  
✅ Easy multi-environment deployment  
✅ Centralized configuration module  

Deploy to **dev**, **qa**, **staging**, or **prod** with confidence! 🚀

