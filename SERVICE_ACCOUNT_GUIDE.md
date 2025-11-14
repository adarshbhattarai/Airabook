# Service Account Management Guide

## 🎯 Overview

This guide explains how service accounts are managed across different environments (local, dev, qa, prod) in this project.

---

## 🔑 How Authentication Works

### Deployed Cloud Functions (Recommended)
When deployed to Firebase, Cloud Functions **automatically use Application Default Credentials (ADC)**:
- ✅ **No service account key needed**
- ✅ **Automatically uses the correct project**
- ✅ **More secure** (no key files to manage)
- ✅ **Works for dev, qa, and prod** environments automatically

### Local Development
When running locally, you can optionally use a service account key:
- Used for testing functions locally
- Stored in `functions/serviceAccountKey.json`
- **Should NOT be committed to git**

---

## 📋 Deployment Strategy

### How It Works

```javascript
const isDeployed = !!process.env.GCLOUD_PROJECT;

if (isDeployed) {
  // Deployed: Use Application Default Credentials (ADC)
  // Automatically correct for dev/qa/prod
  admin.initializeApp({ storageBucket: STORAGE_BUCKET });
} else {
  // Local: Use service account key (optional)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: STORAGE_BUCKET,
  });
}
```

### Deployment Commands

```bash
# Deploy to DEV - uses airabook-dev service account automatically
firebase deploy --only functions --project dev

# Deploy to QA - uses airabook-qa service account automatically  
firebase deploy --only functions --project qa

# Deploy to PROD - uses airabook-prod service account automatically
firebase deploy --only functions --project prod
```

**Each environment automatically gets the correct service account!** 🎉

---

## 🏠 Local Development Setup

### Option 1: Without Service Account Key (Recommended)
You don't need a service account key! Just use the emulators:

```bash
# Start emulators
npm run emulators

# Run frontend
npm run local
```

The code will automatically use default credentials.

### Option 2: With Service Account Key (Optional)
If you need to test against a real Firebase project locally:

1. **Download Service Account Key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your project (e.g., `airabook-dev`)
   - Go to ⚙️ **Project Settings** → **Service Accounts**
   - Click **Generate New Private Key**
   - Download the JSON file

2. **Save the Key:**
   ```bash
   # Rename and save to functions directory
   mv ~/Downloads/airabook-dev-*.json functions/serviceAccountKey.json
   ```

3. **Verify (Optional):**
   The code will warn if the project ID doesn't match:
   ```
   ⚠️  WARNING: Service account project (airaproject-f5298) 
       doesn't match target project (airabook-dev)
   ```

---

## 🔒 Security Best Practices

### ✅ DO:
- ✓ Keep `serviceAccountKey.json` in `.gitignore`
- ✓ Use Application Default Credentials for deployed functions
- ✓ Rotate service account keys periodically
- ✓ Use separate keys for dev/qa/prod when testing locally
- ✓ Delete old service account keys from Firebase Console

### ❌ DON'T:
- ✗ Commit `serviceAccountKey.json` to git
- ✗ Share service account keys via email/Slack
- ✗ Use production keys for local development
- ✗ Hardcode project IDs in the code
- ✗ Leave unused service account keys active

---

## 🗂️ File Structure

```
functions/
├── serviceAccountKey.json        # ⚠️ GITIGNORED - Local dev only
├── serviceAccountKey.example.json # Template (safe to commit)
├── index.js                      # Smart initialization logic
└── config.js                     # Dynamic project detection
```

---

## 🧪 Testing Different Environments Locally

### Test Against Dev
```bash
# Option 1: Use emulators (recommended)
npm run emulators
npm run local

# Option 2: Use dev service account key
# Download key from airabook-dev project
# Save as functions/serviceAccountKey.json
npm run dev
```

### Test Against QA
```bash
# Download key from airabook-qa project
mv ~/Downloads/airabook-qa-*.json functions/serviceAccountKey.json
npm run dev
```

### Test Against Prod (Use with Caution!)
```bash
# Download key from airabook-prod project
mv ~/Downloads/airabook-prod-*.json functions/serviceAccountKey.json
npm run dev
```

---

## 🔍 Verification

### Check Which Credentials Are Being Used

Look for these logs when functions start:

**Deployed Environment:**
```
☁️  Firebase Admin initialized with Application Default Credentials (deployed)
   Project: airabook-dev
```

**Local with Service Account:**
```
🔑 Firebase Admin initialized with service account key (local development)
   Project from key: airabook-dev
```

**Emulator:**
```
🧪 Firebase Admin initialized for emulator environment
```

### Verify Logs After Deployment

```bash
firebase functions:log --project dev | head -20
```

You should see:
```
☁️  Firebase Admin initialized with Application Default Credentials (deployed)
   Project: airabook-dev
```

---

## 🐛 Troubleshooting

### Error: "Token has incorrect aud claim"

**Cause:** Service account from wrong project

**Solution:**
1. **If deployed:** Redeploy - it will use correct credentials automatically
   ```bash
   firebase deploy --only functions --project dev
   ```

2. **If local:** Download service account from correct project
   ```bash
   # Delete old key
   rm functions/serviceAccountKey.json
   
   # Download new key from correct project
   # Save as functions/serviceAccountKey.json
   ```

### Error: "PERMISSION_DENIED"

**Cause:** Service account lacks required permissions

**Solution:** Grant required roles in Google Cloud Console:
- Firebase Admin SDK Administrator Service Agent
- Cloud Datastore User
- Storage Object Admin

### Warning: "Service account project doesn't match target project"

**Cause:** Using service account from different project

**Solution:**
1. For deployed functions: **Ignore this** - not relevant
2. For local dev: Download key from correct project

---

## 📚 Additional Resources

- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)

---

## 🎉 Summary

✅ **Deployed functions:** No service account key needed - automatic!  
✅ **Local development:** Optional - use emulators or service account key  
✅ **Multi-environment:** Each deployment uses correct credentials automatically  
✅ **Secure:** No keys in git, no keys to manage in production  

**You don't need to worry about service accounts when deploying!** 🚀

