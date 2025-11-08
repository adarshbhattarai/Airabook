# 🌍 Multi-Environment Setup Guide

This guide shows how to configure your app for multiple environments: **dev**, **qa**, **staging**, and **production**.

---

## 📋 Overview

| Environment | Purpose | Uses Emulator | Firebase Project |
|-------------|---------|---------------|------------------|
| **dev** | Local development | ✅ Yes | `demo-project` |
| **qa** | QA testing | ❌ No | `airabook-qa` |
| **staging** | Pre-production | ❌ No | `airabook-staging` |
| **production** | Live app | ❌ No | `airabook-prod` |

---

## 🔧 Step 1: Create Environment Files

Create these files in your project root:

### `.env.development`
```env
# Development Environment (Local with Emulators)
VITE_USE_EMULATOR=true
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

### `.env.qa`
```env
# QA Environment
VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-qa-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=airabook-qa.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=airabook-qa
VITE_FIREBASE_STORAGE_BUCKET=airabook-qa.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-qa-sender-id
VITE_FIREBASE_APP_ID=your-qa-app-id
```

### `.env.staging`
```env
# Staging Environment
VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-staging-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=airabook-staging.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=airabook-staging
VITE_FIREBASE_STORAGE_BUCKET=airabook-staging.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-staging-sender-id
VITE_FIREBASE_APP_ID=your-staging-app-id
```

### `.env.production`
```env
# Production Environment
VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-prod-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=airabook.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=airabook-prod
VITE_FIREBASE_STORAGE_BUCKET=airabook-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-prod-sender-id
VITE_FIREBASE_APP_ID=your-prod-app-id
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
```

**Important:** Add these to `.gitignore`:
```
.env.qa
.env.staging
.env.production
```

---

## 📦 Step 2: Update `package.json`

Update your scripts section:

```json
{
  "scripts": {
    "dev": "vite --mode development",
    "build:qa": "vite build --mode qa",
    "build:staging": "vite build --mode staging",
    "build:prod": "vite build --mode production",
    "preview": "vite preview",
    "preview:qa": "vite preview --mode qa",
    "preview:staging": "vite preview --mode staging"
  }
}
```

---

## 🚀 Step 3: How to Use

### Local Development (with emulators)
```bash
npm run dev
```
- Uses `.env.development`
- Connects to Firebase emulators
- `import.meta.env.MODE` = `"development"`
- `VITE_USE_EMULATOR` = `"true"`

### Build for QA
```bash
npm run build:qa
```
- Uses `.env.qa`
- Connects to `airabook-qa` Firebase project
- Output in `dist/` folder

### Build for Staging
```bash
npm run build:staging
```
- Uses `.env.staging`
- Connects to `airabook-staging` Firebase project
- Output in `dist/` folder

### Build for Production
```bash
npm run build:prod
```
- Uses `.env.production`
- Connects to `airabook-prod` Firebase project
- Output in `dist/` folder

---

## 🔍 How It Works

### 1. Vite Loads the Correct `.env` File

When you run a command, Vite automatically loads the appropriate file:

```bash
npm run dev              → .env.development
npm run build:qa         → .env.qa
npm run build:staging    → .env.staging
npm run build:prod       → .env.production
```

### 2. Environment Variables Are Available

In your code, access them via `import.meta.env`:

```javascript
console.log(import.meta.env.MODE);                    // "qa", "staging", "production"
console.log(import.meta.env.VITE_USE_EMULATOR);       // "true" or "false"
console.log(import.meta.env.VITE_FIREBASE_PROJECT_ID); // Project ID
```

### 3. Firebase Connects to the Right Environment

The updated `firebase.js` checks `VITE_USE_EMULATOR`:
- If `"true"` → Connects to local emulators
- If `"false"` → Connects to real Firebase project

---

## 🎯 Environment Detection in Your App

You can add environment indicators in your UI:

```jsx
// Add to your Navbar or footer
const EnvironmentBadge = () => {
  const mode = import.meta.env.MODE;
  
  if (mode === 'production') return null; // Hide in prod
  
  const colors = {
    development: 'bg-blue-500',
    qa: 'bg-yellow-500',
    staging: 'bg-orange-500'
  };
  
  return (
    <div className={`fixed bottom-4 right-4 ${colors[mode]} text-white px-3 py-1 rounded`}>
      {mode.toUpperCase()}
    </div>
  );
};
```

---

## 🔐 Security Best Practices

### 1. Never Commit Sensitive `.env` Files

Update `.gitignore`:
```
# Local env files
.env.local
.env.*.local
.env.qa
.env.staging
.env.production
```

### 2. Use CI/CD Environment Variables

For deployment, store environment variables in your CI/CD platform:
- **Vercel**: Project Settings → Environment Variables
- **Netlify**: Site Settings → Build & Deploy → Environment
- **GitHub Actions**: Repository Settings → Secrets

### 3. Template File

Create `.env.example` for team members:
```env
# Copy this to .env.qa, .env.staging, .env.production and fill in values

VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-domain.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-key
```

---

## 📊 Vite Environment Variables Reference

### Built-in Variables

| Variable | Development | QA/Staging | Production |
|----------|-------------|------------|------------|
| `import.meta.env.MODE` | `"development"` | `"qa"` or `"staging"` | `"production"` |
| `import.meta.env.DEV` | `true` | `false` | `false` |
| `import.meta.env.PROD` | `false` | `true` | `true` |

### Custom Variables (must start with `VITE_`)

All custom environment variables **must** be prefixed with `VITE_` to be exposed to your app:

```env
VITE_MY_VAR=value     # ✅ Available as import.meta.env.VITE_MY_VAR
MY_VAR=value          # ❌ NOT available in client code
```

---

## 🧪 Testing Different Environments

### Test Locally with Different Configs

You can temporarily use different environments locally:

```bash
# Test with QA config locally
vite --mode qa

# Test with staging config locally
vite --mode staging
```

**Note:** This won't use emulators unless you set `VITE_USE_EMULATOR=true` in those files.

---

## 🚢 Deployment Strategies

### Option 1: Single Deployment with Environment Variables

Deploy once, configure environment in hosting platform:

```bash
# Build
npm run build:prod

# Deploy to Vercel/Netlify
# Set environment variables in their dashboard
```

### Option 2: Multiple Firebase Hosting Sites

Use Firebase hosting for each environment:

```bash
# Deploy to QA
firebase use airabook-qa
firebase deploy --only hosting

# Deploy to Staging
firebase use airabook-staging
firebase deploy --only hosting

# Deploy to Production
firebase use airabook-prod
firebase deploy --only hosting
```

---

## 🔄 CI/CD Example (GitHub Actions)

### Deploy QA on Push to `develop` branch

`.github/workflows/deploy-qa.yml`:
```yaml
name: Deploy to QA

on:
  push:
    branches: [ develop ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build for QA
        run: npm run build:qa
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.QA_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.QA_FIREBASE_AUTH_DOMAIN }}
          # ... other secrets
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_QA }}
          projectId: airabook-qa
```

---

## 📝 Summary

| Command | Environment | Emulator | Firebase Project |
|---------|-------------|----------|------------------|
| `npm run dev` | development | ✅ Yes | `demo-project` |
| `npm run build:qa` | qa | ❌ No | `airabook-qa` |
| `npm run build:staging` | staging | ❌ No | `airabook-staging` |
| `npm run build:prod` | production | ❌ No | `airabook-prod` |

**Key Points:**
1. ✅ One codebase, multiple environments
2. ✅ Environment files control configuration
3. ✅ Vite handles environment switching automatically
4. ✅ Never commit sensitive `.env` files
5. ✅ Use CI/CD environment variables for deployment

---

## 🆘 Troubleshooting

### Variables Not Loading

**Problem:** Environment variables showing as `undefined`

**Solutions:**
- ✅ Restart dev server after changing `.env` files
- ✅ Ensure variables start with `VITE_`
- ✅ Check the correct `.env.{mode}` file exists
- ✅ Verify no typos in variable names

### Wrong Environment Loading

**Problem:** App connecting to wrong Firebase project

**Solutions:**
- ✅ Check which mode you're running: `console.log(import.meta.env.MODE)`
- ✅ Verify correct `.env.{mode}` file has correct project ID
- ✅ Clear browser cache and restart

### Emulator Not Connecting

**Problem:** App not connecting to emulators in dev

**Solutions:**
- ✅ Ensure `.env.development` has `VITE_USE_EMULATOR=true`
- ✅ Check emulators are running: `firebase emulators:start`
- ✅ Verify ports are not blocked (9099, 8080, 9199, 5001)

---

**Happy deploying across all your environments!** 🚀

