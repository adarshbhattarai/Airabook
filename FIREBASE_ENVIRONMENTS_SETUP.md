# 🔥 Firebase Multi-Environment Configuration Guide

This guide explains how to configure and use multiple Firebase projects for different environments (dev, qa, prod).

---

## 📋 Overview

| Environment | Purpose | Firebase Project Alias | Uses Emulator |
|-------------|---------|----------------------|---------------|
| **dev** | Local development | `dev` | ✅ Yes |
| **qa** | QA testing | `qa` | ❌ No |
| **prod** | Production | `prod` | ❌ No |

---

## 🚀 Quick Start

### Step 1: Update `.firebaserc` with Your Project IDs

Edit `.firebaserc` and replace the placeholder project IDs with your actual Firebase project IDs:

```json
{
  "projects": {
    "default": "airaproject-f5298",
    "dev": "airaproject-f5298",
    "qa": "your-qa-project-id",
    "prod": "your-prod-project-id"
  }
}
```

**To find your project IDs:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select each project
3. Go to Project Settings (gear icon)
4. Copy the **Project ID** (not the project name)

### Step 2: Create Environment Files

Create environment files for each environment. Copy the template below and fill in the values:

#### `.env.development`
```env
# Development Environment (Local with Emulators)
VITE_USE_EMULATOR=true
VITE_FIREBASE_API_KEY=your-dev-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-dev-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-dev-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-dev-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-dev-sender-id
VITE_FIREBASE_APP_ID=your-dev-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-dev-measurement-id
```

#### `.env.qa`
```env
# QA Environment
VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-qa-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-qa-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-qa-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-qa-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-qa-sender-id
VITE_FIREBASE_APP_ID=your-qa-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-qa-measurement-id
```

#### `.env.production`
```env
# Production Environment
VITE_USE_EMULATOR=false
VITE_FIREBASE_API_KEY=your-prod-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-prod-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-prod-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-prod-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-prod-sender-id
VITE_FIREBASE_APP_ID=your-prod-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-prod-measurement-id
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-site-key
```

**Where to find Firebase config values:**
1. Go to Firebase Console > Your Project
2. Project Settings (gear icon) > General tab
3. Scroll to "Your apps" section
4. Click on your Web app or create one
5. Copy the config values

---

## 🔄 Switching Between Firebase Projects

### Method 1: Using npm scripts (Recommended)

```bash
# Switch to dev environment
npm run firebase:use:dev

# Switch to QA environment
npm run firebase:use:qa

# Switch to production environment
npm run firebase:use:prod

# List all available projects
npm run firebase:projects
```

### Method 2: Using Firebase CLI directly

```bash
# Switch to dev
firebase use dev

# Switch to QA
firebase use qa

# Switch to production
firebase use prod

# List projects
firebase projects:list

# Check current project
firebase use
```

### Method 3: Using helper scripts

```bash
# Using Node.js script
node scripts/firebase-env.js dev
node scripts/firebase-env.js qa
node scripts/firebase-env.js prod

# Using Bash script (make it executable first)
chmod +x scripts/firebase-env.sh
./scripts/firebase-env.sh dev
./scripts/firebase-env.sh qa
./scripts/firebase-env.sh prod
```

---

## 🚢 Deploying to Different Environments

### Deploy to QA

```bash
# Build for QA
npm run build:qa

# Switch to QA project and deploy
npm run deploy:qa

# Or deploy only hosting
npm run deploy:qa:hosting

# Or deploy only functions
npm run deploy:qa:functions
```

### Deploy to Production

```bash
# Build for production
npm run build:prod

# Switch to prod project and deploy
npm run deploy:prod

# Or deploy only hosting
npm run deploy:prod:hosting

# Or deploy only functions
npm run deploy:prod:functions
```

### Manual Deployment Steps

```bash
# 1. Switch to the target environment
firebase use qa  # or prod

# 2. Build the app for that environment
npm run build:qa  # or build:prod

# 3. Deploy
firebase deploy

# Or deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage:rules
```

---

## 📝 Workflow Examples

### Development Workflow

```bash
# 1. Start emulators
npm run emulators

# 2. In another terminal, start dev server
npm run dev

# The app will automatically connect to emulators
```

### QA Testing Workflow

```bash
# 1. Switch to QA project
npm run firebase:use:qa

# 2. Build for QA
npm run build:qa

# 3. Test locally (optional)
npm run preview:qa

# 4. Deploy to QA
npm run deploy:qa:hosting
```

### Production Deployment Workflow

```bash
# 1. Switch to production project
npm run firebase:use:prod

# 2. Verify you're on the right project
npm run firebase:projects

# 3. Build for production
npm run build:prod

# 4. Test the build locally (optional)
npm run preview

# 5. Deploy to production
npm run deploy:prod:hosting

# 6. Verify deployment
# Check Firebase Console > Hosting
```

---

## 🔐 Security Best Practices

### 1. Never Commit Environment Files

The following files are already in `.gitignore`:
- `.env.qa`
- `.env.production`
- `.env.staging`
- `.env.*.local`
- `functions/serviceAccountKey.json`

### 2. Use CI/CD Environment Variables

For automated deployments, store environment variables in your CI/CD platform:

**GitHub Actions Example:**
```yaml
env:
  VITE_FIREBASE_API_KEY: ${{ secrets.QA_FIREBASE_API_KEY }}
  VITE_FIREBASE_PROJECT_ID: ${{ secrets.QA_FIREBASE_PROJECT_ID }}
  # ... other secrets
```

**Vercel/Netlify:**
- Go to Project Settings > Environment Variables
- Add variables for each environment (Development, Preview, Production)

### 3. Service Account Keys

For Firebase Functions, use service account keys:
- Download from Firebase Console > Project Settings > Service Accounts
- Store in `functions/serviceAccountKey.json` (already in `.gitignore`)
- Use different service accounts for each environment

---

## 🧪 Testing Different Environments Locally

### Test QA Environment Locally

```bash
# Build with QA config
npm run build:qa

# Preview the build
npm run preview:qa

# Or run dev server with QA mode (won't use emulators)
vite --mode qa
```

### Test Production Environment Locally

```bash
# Build with production config
npm run build:prod

# Preview the build
npm run preview

# Or run dev server with production mode
vite --mode production
```

**Note:** When testing non-dev environments locally, make sure `VITE_USE_EMULATOR=false` in the respective `.env` files.

---

## 📊 Environment Variable Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_FIREBASE_API_KEY` | Firebase API key | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain | `project-id.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID | `my-project-id` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket | `project-id.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID | `123456789` |
| `VITE_FIREBASE_APP_ID` | App ID | `1:123456789:web:abc123` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_USE_EMULATOR` | Use Firebase emulators | `false` |
| `VITE_FIREBASE_MEASUREMENT_ID` | Google Analytics ID | - |
| `VITE_RECAPTCHA_SITE_KEY` | reCAPTCHA site key (for App Check) | - |

---

## 🆘 Troubleshooting

### Issue: Wrong Firebase Project Connected

**Solution:**
```bash
# Check current project
firebase use

# Switch to correct project
firebase use qa  # or dev, prod

# Verify
firebase projects:list
```

### Issue: Environment Variables Not Loading

**Solutions:**
1. Restart dev server after changing `.env` files
2. Ensure variables start with `VITE_` prefix
3. Check the correct `.env.{mode}` file exists
4. Verify no typos in variable names
5. Clear browser cache

### Issue: Cannot Switch Firebase Project

**Solution:**
```bash
# Make sure you're logged in
firebase login

# List available projects
firebase projects:list

# If project is missing, add it
firebase use --add

# Follow the prompts to add the project
```

### Issue: Deployment Fails

**Solutions:**
1. Verify you're on the correct Firebase project:
   ```bash
   firebase use
   ```

2. Check Firebase CLI is up to date:
   ```bash
   npm install -g firebase-tools
   firebase --version
   ```

3. Verify you have the correct permissions for the project

4. Check build succeeds first:
   ```bash
   npm run build:qa  # or build:prod
   ```

---

## 📚 Additional Resources

- [Firebase CLI Documentation](https://firebase.google.com/docs/cli)
- [Firebase Project Management](https://firebase.google.com/docs/projects/learn-more)
- [Environment Variables in Vite](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase Hosting](https://firebase.google.com/docs/hosting)

---

## ✅ Checklist

- [ ] Updated `.firebaserc` with all project IDs
- [ ] Created `.env.development` file
- [ ] Created `.env.qa` file
- [ ] Created `.env.production` file
- [ ] Tested switching between environments
- [ ] Tested building for each environment
- [ ] Tested deploying to QA
- [ ] Verified `.gitignore` excludes environment files
- [ ] Set up CI/CD environment variables (if using)
- [ ] Documented project IDs for team members

---

**Happy deploying across all your environments!** 🚀

