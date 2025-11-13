# Airabook

A modern web application for creating and managing books, notes, and media content, built with React and Firebase.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Local Development](#local-development)
- [Build Commands](#build-commands)
- [Deployment](#deployment)
- [Firebase Emulators](#firebase-emulators)
- [Environment Files Reference](#environment-files-reference)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

## Overview

Airabook is a full-stack application that enables users to:
- Create and manage books
- Organize notes and media
- Collaborate with co-authors
- Access content across multiple devices

The application uses Firebase for backend services (Authentication, Firestore, Storage, Cloud Functions) and Vite for frontend development.

## Tech Stack

- **Frontend**: React 18, Vite 4
- **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **State Management**: React Context API
- **Routing**: React Router DOM

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 20 or higher (check with `node --version`)
- **npm**: Version 11 or higher (check with `npm --version`)
- **Firebase CLI**: Install globally with `npm install -g firebase-tools`
- **Firebase Account**: Access to Firebase projects (dev, qa, go, prod)

### Verify Installation

```bash
node --version    # Should be v20.x.x or higher
npm --version     # Should be 11.x.x or higher
firebase --version # Should be 13.x.x or higher
```

## Environment Configuration

### Firebase Project Aliases (.firebaserc)

The project uses Firebase project aliases defined in `.firebaserc`:

```json
{
  "projects": {
    "default": "airabook-dev",
    "local": "demo-project",
    "dev": "airabook-dev",
    "qa": "airabook-qa",
    "go": "airabook-21bf5",
    "prod": "airabook-prod"
  }
}
```

**Important**: The `local` alias maps to `demo-project`, which is used exclusively for local emulator development. This project does not need to exist in Firebase Console.

### Environment Files Structure

The project uses Vite's environment file system. Files are loaded based on the mode specified in the command:

| File | When Loaded | Committed? | Purpose |
|------|-------------|-----------|---------|
| `.env` | Always (base) | ✅ Yes | Shared defaults |
| `.env.localemulator` | `--mode localemulator` | ❌ No | Local emulator config |
| `.env.development` | `--mode development` | ✅ Yes | Dev environment config |
| `.env.qa` | `--mode qa` | ✅ Yes | QA environment config |
| `.env.go` | `--mode go` | ✅ Yes | Go/Staging environment config |
| `.env.production` | `--mode production` | ✅ Yes | Production environment config |
| `.env.*.local` | Mode-specific override | ❌ No | Personal overrides |

**Note**: Files ending in `.local` are gitignored and should never be committed.

### Required Environment Variables

Each environment file should contain:

```bash
VITE_USE_EMULATOR=true|false
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_RECAPTCHA_SITE_KEY=your-recaptcha-key (optional)
```

**Security Note**: Firebase Web API keys are safe to commit. They are public by design and do not grant admin access. Security is enforced through Firestore Rules, Storage Rules, and Authentication.

## Local Development

### Option 1: Local Development with Emulators (Recommended for Testing)

This setup runs the frontend locally and connects to Firebase emulators running on your machine.

#### Step 1: Start Firebase Emulators

```bash
npm run emulators:local
```

This starts all Firebase emulators:
- **Emulator UI**: http://localhost:4000
- **Auth Emulator**: http://localhost:9099
- **Firestore Emulator**: http://localhost:8080
- **Storage Emulator**: http://localhost:9199
- **Functions Emulator**: http://localhost:5001

#### Step 2: Start Frontend (in a separate terminal)

```bash
npm start
# or
npm run local
```

The frontend will be available at: http://localhost:5173

**What happens**:
- Frontend loads `.env.localemulator` (emulator config)
- Connects to local emulators
- Project ID: `demo-project`
- All data is local and isolated

### Option 2: Local Development with Real Dev Backend

This setup runs the frontend locally but connects to the real Firebase dev project.

```bash
npm run dev
```

**What happens**:
- Frontend loads `.env.development` (real dev config)
- Connects to `airabook-dev` Firebase project
- Uses real Firebase services (not emulators)
- Data persists in the dev project

### Quick Reference: Local Development Commands

| Command | Frontend Config | Backend | Use Case |
|---------|----------------|---------|----------|
| `npm start` | `.env.localemulator` | Emulators | Local testing |
| `npm run local` | `.env.localemulator` | Emulators | Same as above |
| `npm run dev` | `.env.development` | Real Dev Firebase | Test against dev data |

## Build Commands

Build the application for different environments:

```bash
# Development build
npm run build:dev

# QA build
npm run build:qa

# Go/Staging build
npm run build:go

# Production build
npm run build:prod

# Default build (production)
npm run build
```

### Preview Builds

Preview a built application locally:

```bash
npm run preview          # Preview production build
npm run preview:qa       # Preview QA build
npm run preview:go       # Preview Go/Staging build
```

## Deployment

Deploy to different Firebase environments:

```bash
# Deploy to Dev
npm run deploy:dev

# Deploy to QA
npm run deploy:qa

# Deploy to Go/Staging
npm run deploy:go

# Deploy to Production
npm run deploy:prod
```

### What Gets Deployed

Each deployment command:
1. **Builds** the frontend with the correct environment config
2. **Deploys** both Hosting and Functions to the specified Firebase project

**Note**: Cloud Functions require a Blaze (pay-as-you-go) plan. If your project is on the Spark (free) plan, only Hosting and Firestore Rules will be deployed.

### Deployment Flow

```
npm run deploy:dev
  ↓
npm run build:dev (uses .env.development)
  ↓
vite build --mode development
  ↓
dist/ folder created with dev config
  ↓
firebase deploy --project dev
  ↓
Deploys to airabook-dev Firebase project
```

### Access Deployed Applications

After deployment, access your app at:
- **Dev**: https://airabook-dev.web.app
- **QA**: https://airabook-qa.web.app
- **Go**: https://airabook-21bf5.web.app
- **Prod**: https://airabook-prod.web.app

## Firebase Emulators

### Starting Emulators

```bash
# Start all emulators (default project)
npm run emulators

# Start emulators for local development
npm run emulators:local

# Start emulators with function debugging
npm run emulators:local:debug

# Start emulators with general debugging
npm run emulators:debug
```

### Emulator Ports

| Service | Port | URL |
|---------|------|-----|
| Emulator UI | 4000 | http://localhost:4000 |
| Auth | 9099 | http://localhost:9099 |
| Firestore | 8080 | http://localhost:8080 |
| Storage | 9199 | http://localhost:9199 |
| Functions | 5001 | http://localhost:5001 |
| Functions Debugger | 9229 | (for VSCode debugging) |

### Emulator Data Management

```bash
# Export emulator data
npm run emulators:export

# Import emulator data
npm run emulators:import

# Start with existing data
npm run emulators:with-data
```

### Utility Scripts

```bash
# Seed emulator with test data
npm run seed:data

# Create test user in emulator
npm run create:emulator-user

# Test authentication
npm run test:auth
```

## Environment Files Reference

### Command → Mode → Environment File Mapping

| Command | Vite Mode | Environment Files Loaded | Result |
|---------|-----------|-------------------------|--------|
| `npm start` | `localemulator` | `.env` → `.env.localemulator` | Emulator config |
| `npm run local` | `localemulator` | `.env` → `.env.localemulator` | Emulator config |
| `npm run dev` | `development` | `.env` → `.env.development` | Dev Firebase |
| `npm run build:dev` | `development` | `.env` → `.env.development` | Dev build |
| `npm run build:qa` | `qa` | `.env` → `.env.qa` | QA build |
| `npm run build:go` | `go` | `.env` → `.env.go` | Go build |
| `npm run build:prod` | `production` | `.env` → `.env.production` | Prod build |

### Example Environment Files

#### `.env.localemulator` (Local Emulator)

```bash
VITE_USE_EMULATOR=true
VITE_FIREBASE_PROJECT_ID=demo-project
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-project.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=877560373455
VITE_FIREBASE_APP_ID=1:877560373455:web:bc62f44bb1846074a357ba
VITE_FIREBASE_MEASUREMENT_ID=G-JBG33MH8KL
```

#### `.env.development` (Real Dev Backend)

```bash
VITE_USE_EMULATOR=false
VITE_FIREBASE_PROJECT_ID=airabook-dev
VITE_FIREBASE_API_KEY=your-dev-api-key
VITE_FIREBASE_AUTH_DOMAIN=airabook-dev.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=airabook-dev.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

## Project Structure

```
Airabook/
├── src/                    # Frontend source code
│   ├── components/         # React components
│   ├── pages/              # Page components
│   ├── context/            # React Context providers
│   ├── lib/                # Utility libraries
│   │   └── firebase.js     # Firebase initialization
│   └── main.jsx            # Application entry point
├── functions/               # Cloud Functions
│   ├── index.js            # Functions entry point
│   ├── createBook.js       # Book creation function
│   ├── inviteCoAuthor.js   # Co-author invitation
│   └── utils/              # Function utilities
├── public/                  # Static assets
├── dist/                   # Build output (gitignored)
├── firebase.json           # Firebase configuration
├── .firebaserc             # Firebase project aliases
├── firestore.rules         # Firestore security rules
├── storage.rules           # Storage security rules
├── vite.config.js          # Vite configuration
└── package.json            # Dependencies and scripts
```

### Key Files

- **`src/lib/firebase.js`**: Firebase SDK initialization and emulator connection logic
- **`firebase.json`**: Firebase services configuration (hosting, functions, emulators)
- **`.firebaserc`**: Maps project aliases to Firebase project IDs
- **`vite.config.js`**: Vite build configuration

## Troubleshooting

### Common Issues

#### 1. CORS Errors

**Symptom**: `Access to fetch at 'http://127.0.0.1:5001/...' has been blocked by CORS policy`

**Cause**: Frontend and emulator project IDs don't match

**Solution**:
- Verify `.env.localemulator` has `VITE_FIREBASE_PROJECT_ID=demo-project`
- Verify emulator is started with `--project local` (which maps to `demo-project`)
- Check browser console logs to see which project ID the frontend is using

#### 2. Invalid API Key Error

**Symptom**: `Firebase: Error (auth/invalid-api-key)`

**Cause**: Using a dummy or invalid API key

**Solution**:
- Use a real Firebase Web API key (even for emulators)
- Copy the API key from Firebase Console → Project Settings → Your apps
- API keys are safe to commit - they're public by design

#### 3. Project ID Mismatch

**Symptom**: Functions return 404 or "function does not exist"

**Cause**: Frontend calling `/demo-project/us-central1/...` but emulator running under `/local/...`

**Solution**:
- Ensure `.firebaserc` has `"local": "demo-project"`
- Ensure `.env.localemulator` has `VITE_FIREBASE_PROJECT_ID=demo-project`
- Restart both emulator and frontend after changes

#### 4. Port Already in Use

**Symptom**: `Error: Port 4000 is already in use`

**Solution**:
```bash
# Kill processes on Firebase ports
lsof -ti:4000,9099,8080,5001,9199 | xargs kill -9

# Or kill all Firebase processes
pkill -f "firebase.*emulator"
```

#### 5. Wrong Environment Config Loaded

**Symptom**: Frontend connects to wrong Firebase project

**Solution**:
- Check which mode Vite is using: Look at browser console logs
- Verify env file name matches the mode (e.g., `--mode localemulator` → `.env.localemulator`)
- Remember: `.env.development` loads when using `--mode development`, not `--mode localemulator`

### Verifying Configuration

Check which config is being used:

1. **Browser Console**: Look for Firebase config logs
   ```
   🔧 Firebase config check:
   📍 Mode: localemulator
   🔧 VITE_USE_EMULATOR: true
   🔧 useEmulator: true
   ```

2. **Network Tab**: Check function URLs
   - Emulator: `http://127.0.0.1:5001/demo-project/us-central1/...`
   - Real: `https://us-central1-airabook-dev.cloudfunctions.net/...`

3. **Terminal**: Check emulator logs for project ID
   ```
   ✔ functions[us-central1-createBook]: http function initialized 
   (http://127.0.0.1:5001/demo-project/us-central1/createBook)
   ```

### Environment File Debugging

To see which env file is loaded:

1. Add temporary log in `src/lib/firebase.js`:
   ```javascript
   console.log("Current mode:", import.meta.env.MODE);
   console.log("Project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
   console.log("Use Emulator:", import.meta.env.VITE_USE_EMULATOR);
   ```

2. Check Vite's env loading:
   - Vite loads env files in order (later files override earlier ones)
   - Mode-specific files only load when that mode is active

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)

## Contributing

1. Create a feature branch
2. Make your changes
3. Test locally with emulators
4. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

