# Airabook - Baby Memory Book Application

A modern web application for creating and managing digital baby books with AI-powered features. Built with React, Vite, and Firebase.

## 📋 Table of Contents
- [Prerequisites](#prerequisites)
- [Firebase Configuration](#firebase-configuration)
- [Environment Setup](#environment-setup)
- [Running Locally with Emulators](#running-locally-with-emulators)
- [Development Workflow](#development-workflow)
- [Firebase Functions v2](#firebase-functions-v2)
- [Database Architecture](#database-architecture)
- [Deployment](#deployment)
- [Port Configuration](#port-configuration)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)

---

## 🚀 Prerequisites

- **Node.js**: v20 (required for Firebase Functions)
- **npm**: v8 or higher
- **Firebase CLI**: Latest version
  ```bash
  npm install -g firebase-tools
  ```
- **Firebase Project**: Two projects recommended
  - `airaproject-f5298` (default/production)
  - `airabook-21bf5` (dev) - optional

---

## 🔥 Firebase Configuration

### Configuration Files

1. **`firebase.json`** - Main Firebase configuration
   - Emulator ports
   - Hosting settings
   - Function source directory
   - Firestore and Storage rules

2. **`.firebaserc`** - Project aliases
   ```json
   {
     "projects": {
       "default": "airaproject-f5298",
       "dev": "airaproject-f5298"
     }
   }
   ```

3. **`functions/package.json`** - Functions configuration
   - **IMPORTANT**: Engine must be `"node": "20"`
   - Never use Node.js 18 (decommissioned as of 2025-10-30)

4. **`firestore.rules`** - Firestore security rules
5. **`storage.rules`** - Storage security rules
6. **`firestore.indexes.json`** - Firestore indexes

### Frontend Firebase Config

Located in: `src/lib/firebase.js`

```javascript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
```

**Key Logic**:
- ✅ Uses emulators **only** when:
  - Running on localhost
  - `VITE_USE_EMULATOR=true` is set
  - NOT in production mode
- ✅ Production mode always uses real Firebase services (never emulators)
- ✅ Uses named database `"airabook"` in production

---

## 🌐 Environment Setup

> 📖 **See [ENVIRONMENT_VARIABLES_GUIDE.md](./ENVIRONMENT_VARIABLES_GUIDE.md) for complete environment configuration details**

### Quick Setup

Create `.env.local` in project root for local development:

```bash
# Firebase Config
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=airaproject-f5298
VITE_FIREBASE_STORAGE_BUCKET=airaproject-f5298.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Use emulators for local development
VITE_USE_EMULATOR=true

# Optional: App Check for production
# VITE_FIREBASE_APP_CHECK_KEY=your_recaptcha_key
```

**Important**: `.env.local` is gitignored and used for local development only!

### Backend Environment Variables

Create `functions/.env`:

```bash
# OpenAI Configuration (optional, falls back to Vertex AI)
OPENAI_API_KEY=your_openai_api_key

# Firestore Database Name (optional)
FIRESTORE_DATABASE_ID=airabook  # Defaults to "airabook" if not set

# Service Account (for local development if needed)
GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
```

**Note**: Never commit `.env` files to version control!

---

## 🧪 Running Locally with Emulators

### Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Install functions dependencies
cd functions
npm install
cd ..
```

### Step 2: Build Frontend (for hosting emulator)

```bash
npm run build
```

### Step 3: Start Firebase Emulators

```bash
npm run emulators
```

This starts:
- **Auth Emulator**: http://127.0.0.1:9099
- **Firestore Emulator**: http://127.0.0.1:8080
- **Storage Emulator**: http://127.0.0.1:9199
- **Functions Emulator**: http://127.0.0.1:5001
- **Hosting Emulator**: http://127.0.0.1:5000
- **Emulator UI**: http://127.0.0.1:4000

### Step 4: Start Frontend Dev Server (separate terminal)

```bash
npm run dev
```

Frontend runs at: http://localhost:5173

### Emulator UI Features

Visit http://127.0.0.1:4000 to:
- View Firestore data
- Manage Auth users
- Monitor Storage files
- Test Functions
- View logs

### Other Emulator Commands

```bash
# Start with debug mode for functions
npm run emulators:debug

# Export emulator data
npm run emulators:export

# Start with imported data
npm run emulators:import

# Start with seeded data
npm run emulators:with-data
```

---

## 🛠️ Development Workflow

### Local Development

#### Option 1: Standard Local Development (Recommended)

```bash
# Terminal 1: Start Firebase Emulators
npm run emulators:debug

# Terminal 2: Start Frontend (uses .env.local)
npm run dev
# or
npm start
```

#### Option 2: Development Mode

```bash
# Uses .env.local + .env.development
npm run dev:local
```

#### What Gets Loaded?

| Command | Files Loaded | Best For |
|---------|-------------|----------|
| `npm run dev` | `.env.local` | Daily development (recommended) |
| `npm start` | `.env.local` | Same as `npm run dev` |
| `npm run dev:local` | `.env.local` + `.env.development` | Team-shared development config |

**Steps**:
1. Create `.env.local` with `VITE_USE_EMULATOR=true`
2. Start emulators: `npm run emulators:debug`
3. Start frontend: `npm run dev`
4. Open http://localhost:5173
5. Code changes hot-reload automatically

### Testing Functions Locally

Functions are automatically loaded from `functions/` directory. Any changes trigger a reload.

Monitor function logs in the emulator terminal.

### Killing Ports (if needed)

If you get "port in use" errors:

```powershell
# Find processes using ports
netstat -ano | findstr ":5001 :4000 :8080 :9099 :9199 :5173"

# Kill a specific process (replace PID)
taskkill /PID <PID> /F
```

---

## ⚡ Firebase Functions v2

### **CRITICAL**: Always Use v2 API

This project uses **Firebase Functions v2**. Never use v1 API.

### v2 Import Pattern

```javascript
// ✅ CORRECT - v2
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { onObjectFinalized, onObjectDeleted } = require("firebase-functions/v2/storage");

// ❌ WRONG - v1 (DO NOT USE)
const functions = require("firebase-functions");
```

### v2 Function Declaration

#### HTTP Callable Functions

```javascript
// ✅ CORRECT - v2
exports.myFunction = onCall(
  { region: "us-central1" },
  async (request) => {
    const { data, auth } = request;
    
    // Validate auth
    if (!auth) {
      throw new HttpsError("unauthenticated", "User must be logged in");
    }
    
    // Your logic here
    return { success: true, result: "data" };
  }
);

// ❌ WRONG - v1 (DO NOT USE)
exports.myFunction = functions.https.onCall((data, context) => {
  // Old v1 pattern
});
```

#### HTTP Request Functions

```javascript
// ✅ CORRECT - v2
exports.myEndpoint = onRequest(
  { region: "us-central1" },
  (request, response) => {
    logger.info("Request received");
    response.send("Hello World");
  }
);
```

#### Storage Triggers

```javascript
// ✅ CORRECT - v2
exports.onMediaUpload = onObjectFinalized(
  {
    region: "us-central1",
    bucket: "airaproject-f5298.appspot.com"  // Required!
  },
  async (event) => {
    const filePath = event.data.name;
    const bucket = event.data.bucket;
    
    // Your logic here
  }
);

// ❌ WRONG - v1 (DO NOT USE)
exports.onMediaUpload = functions.storage.object().onFinalize(async (object) => {
  // Old v1 pattern
});
```

### v2 Logging

```javascript
// ✅ CORRECT - v2
const logger = require("firebase-functions/logger");
logger.log("Info message");
logger.warn("Warning message");
logger.error("Error message");

// ❌ WRONG - v1 (DO NOT USE)
console.log("message");  // Still works but not recommended
functions.logger.log("message");  // v1 pattern
```

### v2 Error Handling

```javascript
// ✅ CORRECT - v2
const { HttpsError } = require("firebase-functions/v2/https");

throw new HttpsError("invalid-argument", "Missing required field");
throw new HttpsError("not-found", "Resource not found");
throw new HttpsError("permission-denied", "Unauthorized");
throw new HttpsError("internal", "Internal server error");

// ❌ WRONG - v1 (DO NOT USE)
throw new functions.https.HttpsError("invalid-argument", "message");
```

### Region Configuration

**Always specify region** for consistency:

```javascript
{ region: "us-central1" }
```

This ensures all functions are deployed to the same region.

---

## 🗄️ Database Architecture

### Named Database: "airabook"

**Frontend**: Uses named database `"airabook"` in production:

```javascript
const isProduction = import.meta.env.MODE === 'production';
export const firestore = isProduction 
  ? getFirestore(app, "airabook")  // Named database
  : getFirestore(app);              // Default database
```

**Backend**: Implements fallback logic for database access:

```javascript
function getFirestoreDB() {
  const app = admin.app();
  const databaseId = process.env.FIRESTORE_DATABASE_ID || "airabook";
  
  try {
    const db = admin.firestore(app, databaseId);
    logger.log(`🔥 Firestore instance obtained for database: ${databaseId}`);
    return { db, databaseId };
  } catch (error) {
    logger.error(`❌ Error getting Firestore instance:`, error);
    throw error;
  }
}

async function withDatabaseFallback(db, databaseId, operation, operationName) {
  try {
    return await operation(db);
  } catch (error) {
    // Check for NOT_FOUND error (database not accessible)
    const isNotFound = error.code === 5 || 
                      error.message?.includes('NOT_FOUND');
    
    if (isNotFound && databaseId !== "(default)") {
      logger.warn(`⚠️ Database "${databaseId}" not accessible. Falling back to default.`);
      
      // Switch to default database
      const defaultDb = admin.firestore(admin.app());
      return await operation(defaultDb);
    } else {
      throw error;
    }
  }
}
```

**Why the Fallback?**
- Client SDK can access named databases in production
- Admin SDK may not have access to named databases (permissions/configuration)
- Fallback ensures functions work even if named database is not accessible

### Collections Structure

```
users/
  {userId}/
    - displayName
    - email
    - accessibleBookIds[]
    - accessibleAlbums[]

books/
  {bookId}/
    - babyName
    - ownerId
    - members{}
    - chapterCount
    - coverImageUrl
    - createdAt
    
    chapters/
      {chapterId}/
        - title
        - order
        - notes[]
        - pagesSummary[]

albums/
  {albumId}/
    - name
    - type: "book"
    - bookId
    - images[]
    - videos[]
    - mediaCount

mediaUrls/
  {mediaId}/
    - url
    - userId
    - createdAt
```

---

## 🚢 Deployment

### Deploy Everything

```bash
firebase deploy
```

### Deploy Frontend Only

```bash
# Build for production
npm run build

# Deploy hosting
firebase deploy --only hosting
```

### Deploy Functions Only

```bash
firebase deploy --only functions
```

### Deploy to Dev Environment

```bash
# Set project alias
firebase use dev

# Deploy
npm run build
firebase deploy --only hosting,functions
```

### Deploy Specific Function

```bash
firebase deploy --only functions:createBook
```

### Pre-Deployment Checklist

- [ ] `functions/package.json` has `"node": "20"`
- [ ] All functions use v2 API (not v1)
- [ ] Storage triggers specify bucket name
- [ ] Environment variables are set in Firebase Console
- [ ] Frontend built with `npm run build`
- [ ] `VITE_USE_EMULATOR=false` or not set for production

---

## 🔌 Port Configuration

### Emulator Ports (Local Development)

| Service | Port | Emulator UI Link |
|---------|------|------------------|
| Auth | 9099 | http://127.0.0.1:4000/auth |
| Firestore | 8080 | http://127.0.0.1:4000/firestore |
| Storage | 9199 | http://127.0.0.1:4000/storage |
| Functions | 5001 | http://127.0.0.1:4000/functions |
| Hosting | 5000 | n/a |
| Emulator UI | 4000 | http://127.0.0.1:4000 |
| Emulator Hub | 4400 | - |
| Reserved | 4500, 9150 | - |

### Frontend Dev Server

| Service | Port |
|---------|------|
| Vite Dev Server | 5173 |

**Configuration**: Defined in `firebase.json` under `emulators` section.

---

## 🐛 Troubleshooting

### Port Already in Use

**Error**: `Port 8080 is not open`

**Solution**:
```powershell
# Find the process
netstat -ano | findstr ":8080"

# Kill it
taskkill /PID <PID> /F
```

### Functions Not Loading

**Error**: `Failed to load function`

**Check**:
1. ✅ Using v2 API (not v1)
2. ✅ `functions/package.json` has `"node": "20"`
3. ✅ All dependencies installed: `cd functions && npm install`
4. ✅ No syntax errors in function files
5. ✅ `firebase-functions` version is `^5.0.0` or higher

### Emulator Can't Connect

**Error**: Frontend shows "Firebase: Error (auth/network-request-failed)"

**Check**:
1. ✅ `VITE_USE_EMULATOR=true` in `.env.local`
2. ✅ Running on `localhost` (not `127.0.0.1`)
3. ✅ Emulators are running (`npm run emulators`)
4. ✅ Check `src/lib/firebase.js` emulator connection logic

### Database Not Found Error

**Error**: `Database "airabook" not found (error code: 5)`

**Solution**: This is expected! The function will automatically fall back to the default database. Check logs for:
```
⚠️ Database "airabook" not accessible. Falling back to default.
```

### Storage Trigger Missing Bucket

**Error**: `Missing bucket name`

**Solution**: Add bucket to storage trigger config:
```javascript
exports.onMediaUpload = onObjectFinalized(
  {
    region: "us-central1",
    bucket: "airaproject-f5298.appspot.com"  // Add this!
  },
  async (event) => { /* ... */ }
);
```

### Deployment Fails - Runtime Error

**Error**: `Runtime Node.js 18 was decommissioned`

**Solution**: Update `functions/package.json`:
```json
{
  "engines": {
    "node": "20"  // Not 18!
  }
}
```

### Frontend Shows Emulator in Production

**Issue**: Deployed app connects to emulators instead of real Firebase

**Check**:
1. ✅ `VITE_USE_EMULATOR=false` or not set
2. ✅ Build with production mode: `npm run build` (not `npm run build:dev`)
3. ✅ Check `src/lib/firebase.js` - should not connect to emulators in production

---

## 📁 Project Structure

```
Airabook/
├── functions/                  # Firebase Functions (Backend)
│   ├── index.js               # Main entry point (exports all functions)
│   ├── createBook.js          # Book creation logic
│   ├── mediaProcessor.js      # Storage triggers
│   ├── imageProcessor.js      # Image upload handler
│   ├── textGenerator.js       # AI text generation
│   ├── inviteCoAuthor.js      # Co-author invitations
│   ├── utils/
│   │   ├── aiClient.js        # AI client (OpenAI/Vertex AI)
│   │   └── prompts.js         # AI prompts
│   ├── package.json           # Functions dependencies (node: 20!)
│   ├── .env                   # Backend environment variables
│   └── serviceAccountKey.json # Service account (local dev only)
│
├── src/                       # Frontend (React + Vite)
│   ├── components/            # Reusable components
│   ├── pages/                 # Page components
│   ├── lib/
│   │   ├── firebase.js        # Firebase initialization ⭐
│   │   └── utils.js           # Utility functions
│   ├── context/
│   │   └── AuthContext.jsx    # Authentication context
│   ├── App.jsx                # Root component
│   └── main.jsx               # Entry point
│
├── public/                    # Static assets
├── dist/                      # Build output (hosting)
│
├── firebase.json              # Firebase configuration ⭐
├── .firebaserc                # Project aliases ⭐
├── firestore.rules            # Firestore security rules
├── storage.rules              # Storage security rules
├── firestore.indexes.json     # Firestore indexes
│
├── package.json               # Root dependencies & scripts ⭐
├── vite.config.js             # Vite configuration
├── tailwind.config.js         # Tailwind CSS config
│
├── .env.local                 # Frontend environment (local)
└── README.md                  # This file
```

### Key Files (⭐)

- **`firebase.json`**: All Firebase service configuration
- **`.firebaserc`**: Project aliases (default, dev)
- **`package.json`**: Scripts for dev, build, emulators
- **`functions/package.json`**: Must have `"node": "20"`
- **`src/lib/firebase.js`**: Frontend Firebase setup & emulator logic

---

## 📝 Development Guidelines

### 1. Always Use Firebase Functions v2
- Import from `firebase-functions/v2/*`
- Never use `firebase-functions` directly (v1)

### 2. ID Generation
- Use `IDGenerator.generateId()` (already implemented)
- Never use `uuid()` or custom ID logic

### 3. Database Access Pattern
- Controller → Service → Repository → Mapper
- Use MyBatis mappers (if applicable)
- Never write core logic in controllers

### 4. Error Handling
- Use `HttpsError` for callable functions
- Log with `logger` (not `console.log`)
- Implement try-catch in all async functions

### 5. Database Operations
- Use `getFirestoreDB()` helper
- Wrap operations in `withDatabaseFallback()`
- Log database name being accessed

### 6. Testing Locally
- Always test with emulators before deploying
- Check both frontend and function logs
- Verify data in Emulator UI (http://127.0.0.1:4000)

---

## 🎨 Style Guidelines

- **Primary Color**: `#3498db` (calming blue)
- **Secondary Color**: `#ecf0f1` (light gray)
- **Accent Color**: `#2ecc71` (vibrant green)
- Clean, structured layout with clear visual hierarchy
- Consistent and intuitive icons
- Subtle transitions and animations

---

## 🤝 Contributing

### For New Team Members

1. Read this README thoroughly
2. Set up local environment following [Environment Setup](#environment-setup)
3. Run emulators and test locally
4. Review existing code patterns in `functions/` and `src/`
5. Ask questions if anything is unclear!

### Code Review Checklist

- [ ] Using Firebase Functions v2 (not v1)
- [ ] All functions have region specified
- [ ] Storage triggers include bucket name
- [ ] Error handling implemented
- [ ] Logging added for debugging
- [ ] Database fallback logic used
- [ ] Tested locally with emulators
- [ ] No hardcoded values (use env variables)

---

## 📞 Support

- **Firebase Documentation**: https://firebase.google.com/docs
- **Functions v2 Migration**: https://firebase.google.com/docs/functions/2nd-gen-upgrade
- **Issue Tracker**: https://github.com/firebase/firebase-tools/issues

---

## 📄 License

Private project - All rights reserved

---

**Last Updated**: November 2025

**Maintainer**: Development Team

**Firebase Project**: airaproject-f5298

