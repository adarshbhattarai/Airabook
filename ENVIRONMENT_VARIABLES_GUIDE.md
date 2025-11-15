# Environment Variables Configuration Guide

This guide explains how to configure environment variables for different development and deployment scenarios.

## 📋 Table of Contents
- [Overview](#overview)
- [Environment Files](#environment-files)
- [NPM Scripts](#npm-scripts)
- [Local Development Setup](#local-development-setup)
- [Environment Variables Reference](#environment-variables-reference)
- [Troubleshooting](#troubleshooting)

---

## 🌍 Overview

This project uses Vite's environment variable system. Environment files are loaded in this priority order:

1. `.env` - Loaded in all cases (base configuration)
2. `.env.local` - **Loaded in all cases, gitignored** ⭐ (your local overrides)
3. `.env.[mode]` - Only loaded in specified mode (e.g., `.env.development`)
4. `.env.[mode].local` - Only loaded in specified mode, gitignored

**Important**: `.env.local` has the **highest priority** for local development!

---

## 📁 Environment Files

### `.env.local` (Recommended for Local Development)

**Location**: Project root  
**Gitignored**: ✅ Yes  
**When Used**: Always (all npm commands)  
**Purpose**: Your personal local configuration

Create this file with:

```bash
# .env.local
# Local Development with Firebase Emulators

VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=airaproject-f5298
VITE_FIREBASE_STORAGE_BUCKET=airaproject-f5298.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id_here

# Use emulators for local development
VITE_USE_EMULATOR=true
```

### `.env.development` (Optional)

**Location**: Project root  
**Gitignored**: ❌ No (can be committed for team)  
**When Used**: When `--mode development` is specified  
**Purpose**: Shared development environment config

Create this file with:

```bash
# .env.development
# Shared development configuration for the team

VITE_MODE=development

# Team-wide development settings can go here
# Individual developers should override in .env.local
```

### `.env.development.local` (Optional)

**Location**: Project root  
**Gitignored**: ✅ Yes  
**When Used**: When `--mode development` + local overrides needed  
**Purpose**: Personal overrides for development mode

### `.env.example` (Template)

Create this as a template for team members:

```bash
# .env.example
# Copy this to .env.local and fill in your values

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=

# Set to 'true' for local development with emulators
VITE_USE_EMULATOR=true

# Optional: App Check for production
# VITE_FIREBASE_APP_CHECK_KEY=
```

---

## 🚀 NPM Scripts

### Development Commands

| Command | Environment Files Loaded | Use Case |
|---------|--------------------------|----------|
| `npm run dev` | `.env`, `.env.local` | **Default local development** (uses emulators) |
| `npm start` | `.env`, `.env.local` | Alias for `npm run dev` |
| `npm run dev:local` | `.env`, `.env.local`, `.env.development`, `.env.development.local` | Explicit development mode |

### Build Commands

| Command | Mode | Environment Files Loaded |
|---------|------|--------------------------|
| `npm run build` | `production` | `.env`, `.env.local`, `.env.production`, `.env.production.local` |
| `npm run build:dev` | `development` | `.env`, `.env.local`, `.env.development`, `.env.development.local` |
| `npm run build:qa` | `qa` | `.env`, `.env.local`, `.env.qa`, `.env.qa.local` |
| `npm run build:staging` | `staging` | `.env`, `.env.local`, `.env.staging`, `.env.staging.local` |
| `npm run build:prod` | `production` | `.env`, `.env.local`, `.env.production`, `.env.production.local` |

---

## 🔧 Local Development Setup

### Step 1: Create `.env.local`

```bash
# Create the file in project root
touch .env.local
```

### Step 2: Add Your Firebase Configuration

Get your Firebase config from:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (e.g., `airaproject-f5298`)
3. Go to Project Settings → General
4. Scroll to "Your apps" → Web app
5. Copy the configuration values

Paste into `.env.local`:

```bash
VITE_FIREBASE_API_KEY=AIzaSyC...
VITE_FIREBASE_AUTH_DOMAIN=airaproject-f5298.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=airaproject-f5298
VITE_FIREBASE_STORAGE_BUCKET=airaproject-f5298.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-ABC123

# Enable emulators for local development
VITE_USE_EMULATOR=true
```

### Step 3: Start Development

**Option A: With Emulators** (Recommended)

```bash
# Terminal 1: Start Firebase Emulators
npm run emulators:debug

# Terminal 2: Start Frontend
npm run dev
```

**Option B: Without Emulators** (Use Real Firebase)

```bash
# Set in .env.local
VITE_USE_EMULATOR=false

# Then start frontend
npm run dev
```

### Step 4: Verify Configuration

Open your browser console at http://localhost:5173 and check:

```
🔧 Firebase config check:
📍 Mode: development
📍 Is Production: false
📍 Hostname: localhost
🔧 VITE_USE_EMULATOR: true
🔧 useEmulator: true
🔥 Connected to Firebase emulators
```

---

## 📚 Environment Variables Reference

### Firebase Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | ✅ Yes | Firebase API Key | `AIzaSyC...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ Yes | Auth domain | `project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ✅ Yes | Project ID | `airaproject-f5298` |
| `VITE_FIREBASE_STORAGE_BUCKET` | ✅ Yes | Storage bucket | `project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ✅ Yes | Sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | ✅ Yes | App ID | `1:123:web:abc` |
| `VITE_FIREBASE_MEASUREMENT_ID` | ❌ No | Analytics ID | `G-ABC123` |

### Emulator Configuration

| Variable | Required | Values | Description |
|----------|----------|--------|-------------|
| `VITE_USE_EMULATOR` | ❌ No | `true` / `false` | Connect to emulators (local dev) or real Firebase (production) |

**Important**: 
- Emulators are **only used** when:
  1. Running on `localhost`
  2. `VITE_USE_EMULATOR=true` is set
  3. NOT in production mode
- In production builds, emulators are **never used** (even if flag is true)

### App Check (Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_APP_CHECK_KEY` | ❌ No | reCAPTCHA v3 site key for App Check |

---

## 🐛 Troubleshooting

### Issue: "Firebase: Error (auth/network-request-failed)"

**Cause**: Frontend trying to connect to emulators, but they're not running.

**Solution**:
```bash
# Start emulators
npm run emulators:debug
```

### Issue: Frontend connects to production instead of emulators

**Check**:
1. ✅ `VITE_USE_EMULATOR=true` in `.env.local`
2. ✅ Running on `localhost` (not `127.0.0.1`)
3. ✅ Emulators are running (`npm run emulators:debug`)
4. ✅ Browser console shows: "Connected to Firebase emulators"

### Issue: Environment variables not loading

**Solutions**:
1. Restart dev server: `Ctrl+C` then `npm run dev`
2. Verify file name is exactly `.env.local` (no spaces, correct extension)
3. Variables must start with `VITE_` to be exposed to frontend
4. Check for syntax errors (no spaces around `=`)

### Issue: Different values in production

**Cause**: `.env.local` is gitignored, not deployed.

**Solution**: Set environment variables in your hosting platform:
- Firebase Hosting: Use `.env.production`
- Vercel/Netlify: Set in dashboard under "Environment Variables"

### Issue: Emulators used in production

**This should never happen!** The code explicitly prevents it:

```javascript
// In src/lib/firebase.js
const isProduction = import.meta.env.MODE === 'production';
let useEmulator = false;
if (!isProduction) {
  // Only checked in non-production
}
```

Production builds (`npm run build`) always use real Firebase services.

---

## 📝 Best Practices

### ✅ DO

- ✅ Use `.env.local` for all local development
- ✅ Set `VITE_USE_EMULATOR=true` for local development
- ✅ Add `.env*.local` to `.gitignore`
- ✅ Create `.env.example` as a template for the team
- ✅ Document required variables in README
- ✅ Use environment-specific builds for different environments

### ❌ DON'T

- ❌ Commit `.env.local` to git (contains secrets!)
- ❌ Hardcode API keys in source code
- ❌ Use production credentials in `.env.development`
- ❌ Share your `.env.local` file with others
- ❌ Use emulators in production (already prevented in code)

---

## 🔐 Security Notes

1. **Never commit** `.env.local` or any file with real credentials
2. **Always** add `.env*.local` to `.gitignore`
3. **Use** different Firebase projects for development and production
4. **Rotate** API keys if accidentally exposed
5. **Use** Firebase App Check in production for additional security

---

## 📖 Additional Resources

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase Project Setup](https://firebase.google.com/docs/web/setup)
- [Firebase Emulators](https://firebase.google.com/docs/emulator-suite)

---

**Last Updated**: November 2024  
**Maintainer**: Development Team

