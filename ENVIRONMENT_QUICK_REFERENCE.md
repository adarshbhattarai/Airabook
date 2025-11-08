# 🎯 Environment Quick Reference

## Commands

```bash
# Development (with emulators)
npm run dev

# Build for QA
npm run build:qa

# Build for Staging
npm run build:staging

# Build for Production
npm run build:prod
```

---

## Environment Variables Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Command Executed                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Vite detects --mode flag and loads corresponding .env     │
│                                                             │
│  npm run dev             → .env.development                │
│  npm run build:qa        → .env.qa                         │
│  npm run build:staging   → .env.staging                    │
│  npm run build:prod      → .env.production                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│           Environment Variables Available in Code           │
│                                                             │
│  import.meta.env.MODE                                      │
│  import.meta.env.VITE_USE_EMULATOR                        │
│  import.meta.env.VITE_FIREBASE_PROJECT_ID                 │
│  ... etc                                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               firebase.js Checks VITE_USE_EMULATOR         │
│                                                             │
│  if (VITE_USE_EMULATOR === 'true')                        │
│    → Connect to localhost emulators                        │
│  else                                                       │
│    → Connect to real Firebase project                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Matrix

| Environment | Command | Emulator | Project ID | URL |
|-------------|---------|----------|------------|-----|
| **DEV** | `npm run dev` | ✅ | `demo-project` | `localhost:5173` |
| **QA** | `npm run build:qa` | ❌ | `airabook-qa` | `qa.airabook.com` |
| **STAGING** | `npm run build:staging` | ❌ | `airabook-staging` | `staging.airabook.com` |
| **PROD** | `npm run build:prod` | ❌ | `airabook-prod` | `airabook.com` |

---

## What Gets Set Automatically

### Development Mode (`npm run dev`)
```javascript
import.meta.env.MODE          // "development"
import.meta.env.DEV           // true
import.meta.env.PROD          // false
import.meta.env.VITE_USE_EMULATOR  // "true" (from .env.development)
```

### QA Mode (`npm run build:qa`)
```javascript
import.meta.env.MODE          // "qa"
import.meta.env.DEV           // false
import.meta.env.PROD          // true
import.meta.env.VITE_USE_EMULATOR  // "false" (from .env.qa)
```

### Staging Mode (`npm run build:staging`)
```javascript
import.meta.env.MODE          // "staging"
import.meta.env.DEV           // false
import.meta.env.PROD          // true
import.meta.env.VITE_USE_EMULATOR  // "false" (from .env.staging)
```

### Production Mode (`npm run build:prod`)
```javascript
import.meta.env.MODE          // "production"
import.meta.env.DEV           // false
import.meta.env.PROD          // true
import.meta.env.VITE_USE_EMULATOR  // "false" (from .env.production)
```

---

## Files You Need to Create

```
your-project/
├── .env.development     ← Create this (emulator config)
├── .env.qa             ← Create this (QA Firebase project)
├── .env.staging        ← Create this (Staging Firebase project)
├── .env.production     ← Create this (Prod Firebase project)
├── .env.example        ← Create this (template for team)
└── .gitignore          ← Add .env.* files (except .env.development)
```

---

## Checklist for Each Environment

### ✅ Development
- [ ] `.env.development` exists
- [ ] `VITE_USE_EMULATOR=true`
- [ ] Firebase emulators running
- [ ] Can sign up/login with test accounts

### ✅ QA
- [ ] `.env.qa` exists with QA Firebase credentials
- [ ] `VITE_USE_EMULATOR=false`
- [ ] QA Firebase project created in Firebase Console
- [ ] Build completes: `npm run build:qa`

### ✅ Staging
- [ ] `.env.staging` exists with Staging Firebase credentials
- [ ] `VITE_USE_EMULATOR=false`
- [ ] Staging Firebase project created
- [ ] Build completes: `npm run build:staging`

### ✅ Production
- [ ] `.env.production` exists with Prod Firebase credentials
- [ ] `VITE_USE_EMULATOR=false`
- [ ] Production Firebase project created
- [ ] App Check configured (ReCaptcha)
- [ ] Build completes: `npm run build:prod`

---

## Common Use Cases

### "I want to develop locally with emulators"
```bash
npm run dev
```

### "I want to test against QA Firebase (not emulators)"
```bash
# Build for QA
npm run build:qa

# Preview the build
npm run preview:qa
```

### "I want to deploy to staging"
```bash
npm run build:staging
firebase use airabook-staging
firebase deploy --only hosting
```

### "I want to deploy to production"
```bash
npm run build:prod
firebase use airabook-prod
firebase deploy --only hosting
```

---

## Debug Commands

```bash
# Check which mode you're in (add to any file)
console.log('Mode:', import.meta.env.MODE);
console.log('Use Emulator:', import.meta.env.VITE_USE_EMULATOR);
console.log('Project:', import.meta.env.VITE_FIREBASE_PROJECT_ID);
```

---

## Need Help?

See full guide: `ENVIRONMENT_SETUP_GUIDE.md`

