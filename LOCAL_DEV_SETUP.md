# Local Development Setup Guide

## 🎯 Overview

This guide explains how to set up your local development environment with or without service account keys.

---

## 🚀 Quick Start (Recommended for Most Development)

### Using Emulators (No Service Account Needed)

```bash
# Terminal 1: Start Firebase Emulators
npm run emulators:debug

# Terminal 2: Start Frontend
npm run local
```

✅ **No service account key needed!**  
✅ **Works completely offline**  
✅ **Fast and safe for development**

**Access:**
- Frontend: http://localhost:5173
- Emulator UI: http://localhost:4000

---

## 🔑 Using Service Account Keys (Advanced)

### When You Need This

Only if you want to test locally against **real Firebase** (not emulators):
- Testing with production data
- Debugging issues specific to deployed environment
- Testing integrations that don't work with emulators

---

## 📂 Secure Key Storage

### Step 1: Create a Secure Directory

**Windows:**
```bash
mkdir C:\firebase-keys
```

**Mac/Linux:**
```bash
mkdir ~/firebase-keys
chmod 700 ~/firebase-keys
```

### Step 2: Store Keys by Project

```
C:\firebase-keys\
├── airabook-dev-key.json
├── airabook-qa-key.json
└── airabook-prod-key.json
```

---

## 🔧 Configuration Options

### Option 1: Environment Variable (Recommended)

Create `functions/.env` file:

```bash
# For dev environment
GOOGLE_APPLICATION_CREDENTIALS=C:/firebase-keys/airabook-dev-key.json

# Or use custom variable
# SERVICE_ACCOUNT_KEY_PATH=C:/firebase-keys/airabook-dev-key.json
```

### Option 2: Set System Environment Variable

**Windows PowerShell:**
```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"
```

**Mac/Linux:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/firebase-keys/airabook-dev-key.json
```

### Option 3: Pass as Command Argument

**Windows:**
```powershell
$env:SERVICE_ACCOUNT_KEY_PATH="C:\firebase-keys\airabook-dev-key.json"; npm run emulators
```

**Mac/Linux:**
```bash
SERVICE_ACCOUNT_KEY_PATH=~/firebase-keys/airabook-dev-key.json npm run emulators
```

---

## 🧪 Testing Different Environments

### Test Against Dev
```bash
# Set key location
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"

# Start emulators (functions will use the key)
npm run emulators

# Start frontend in dev mode
npm run dev
```

### Test Against QA
```bash
# Set key location
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-qa-key.json"

# Start emulators
npm run emulators

# Start frontend
npm run dev
```

---

## 📋 How It Works

The code checks for service account keys in this priority order:

1. **`GOOGLE_APPLICATION_CREDENTIALS`** environment variable (Google's standard)
2. **`SERVICE_ACCOUNT_KEY_PATH`** environment variable (custom)
3. **`./serviceAccountKey.json`** in functions directory (not recommended)
4. **Fallback:** Application Default Credentials

```javascript
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 
                process.env.SERVICE_ACCOUNT_KEY_PATH || 
                "./serviceAccountKey.json";
```

---

## ✅ Verification

Check which credentials are being used by looking at the console output:

### Emulator Mode:
```
🧪 Firebase Admin initialized for emulator environment
```

### With Service Account Key:
```
🔑 Firebase Admin initialized with service account key (local development)
   Key location: C:/firebase-keys/airabook-dev-key.json
   Project from key: airabook-dev
```

### Without Key (Default Credentials):
```
🔧 Firebase Admin initialized with default credentials
⚠️  No service account key found at: ./serviceAccountKey.json
   This is fine for emulators or if using Application Default Credentials
```

---

## 🛡️ Security Best Practices

### ✅ DO:
- ✓ Store keys **outside** your project directory
- ✓ Use `.env` for local configuration (gitignored)
- ✓ Use different keys for dev/qa/prod
- ✓ Delete keys you no longer need
- ✓ Rotate keys periodically (every 90 days)

### ❌ DON'T:
- ✗ Commit keys to git
- ✗ Store keys in project directory
- ✗ Share keys via email/Slack
- ✗ Use production keys for testing
- ✗ Leave keys unencrypted on shared machines

---

## 📝 Example Workflows

### Workflow 1: Daily Development (Emulators)
```bash
# No key needed!
npm run emulators:debug     # Terminal 1
npm run local               # Terminal 2
```

### Workflow 2: Testing Against Dev Firebase
```bash
# Set key once per session
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"

# Run emulators
npm run emulators:debug     # Terminal 1
npm run dev                 # Terminal 2
```

### Workflow 3: Quick Test Without Emulators
```bash
# Set key
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"

# Run frontend only (connects to real dev Firebase)
npm run dev
```

---

## 🐛 Troubleshooting

### Issue: "No service account key found"

**If using emulators:**  
✅ This is normal! Emulators don't need a key.

**If trying to connect to real Firebase:**  
❌ Set the environment variable with correct path:
```bash
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"
```

### Issue: "Service account project doesn't match"

**Cause:** Using key from wrong project (e.g., dev key when connecting to qa)

**Solution:** Use the correct key for your target environment:
```bash
# For dev
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-dev-key.json"

# For qa
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\firebase-keys\airabook-qa-key.json"
```

### Issue: "Permission denied" reading key file

**Windows:**
```powershell
icacls C:\firebase-keys\airabook-dev-key.json /grant:r "$($env:USERNAME):(R)"
```

**Mac/Linux:**
```bash
chmod 600 ~/firebase-keys/airabook-dev-key.json
```

---

## 🎓 Summary

| Scenario | Service Account Key | Command |
|----------|-------------------|---------|
| **Emulators** | ❌ Not needed | `npm run emulators && npm run local` |
| **Local → Dev** | ✅ Optional | Set `GOOGLE_APPLICATION_CREDENTIALS` |
| **Local → QA** | ✅ Optional | Set `GOOGLE_APPLICATION_CREDENTIALS` |
| **Deployed** | ❌ Not needed | Uses ADC automatically |

---

## 📚 Additional Resources

- [Google Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)

---

## 🎉 You're All Set!

**For daily development:** Just use emulators (no keys needed)  
**For testing against real Firebase:** Set the environment variable

Your keys are now secure outside the project! 🔒

