# Media & Storage Test Suites

This directory contains two versions of the media integration tests:

1. **Local Emulator Tests** (`run-local-media-tests.cjs`) - For development with Firebase Emulator
2. **Production Tests** (`run-production-media-tests.cjs`) - For testing deployed Firebase projects

## Quick Start

### Local/Emulator Testing
```bash
# Start emulators
npm run emulator

# Run tests
node functions/tests/run-local-media-tests.cjs
```

### Production Testing
```bash
# Set up credentials
export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
export FIREBASE_PROJECT_ID="your-project-id"

# Run tests
node functions/tests/run-production-media-tests.cjs
```

---

## Local Emulator Tests

**File:** `run-local-media-tests.cjs`

### Purpose
Tests media functionality using the Firebase Emulator Suite during development.

### Prerequisites
- Firebase emulators running (`npm run emulator`)
- Emulator ports:
  - Firestore: 8080
  - Auth: 9099
  - Storage: 9199
  - Functions: 5001

### Key Features
- ✅ Works around Storage Emulator SSL limitations
- ✅ Uses HTTP directly for file uploads
- ✅ Tests all core functionality
- ✅ Fast execution (local only)
- ✅ No Firebase project required

### Limitations
- ⚠️ Cannot test cover deletion via Admin SDK (emulator SSL issue)
- ⚠️ Uses HTTP workarounds instead of normal SDK methods
- ⚠️ Some operations may behave slightly differently than production

### What It Tests
1. ✅ Book creation with cover
2. ✅ Album auto-creation for books
3. ✅ Standalone album creation
4. ✅ Media upload to albums
5. ✅ Media attachment to pages
6. ✅ `usedIn` tracking
7. ✅ Media deletion
8. ✅ Storage usage tracking (media only, covers are FREE)

### Running
```bash
node functions/tests/run-local-media-tests.cjs
```

---

## Production Tests

**File:** `run-production-media-tests.cjs`

### Purpose
Tests media functionality on a DEPLOYED Firebase project (dev/staging/prod).

### Prerequisites
1. **Firebase Project Deployed**
   ```bash
   firebase deploy --only functions
   ```

2. **Service Account Key**
   - Download from Firebase Console → Project Settings → Service Accounts
   - Save as `serviceAccountKey.json` (don't commit!)

3. **Environment Variables**
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
   export FIREBASE_PROJECT_ID="your-project-id"
   ```

### Key Features
- ✅ Uses Firebase Admin SDK normally (no workarounds)
- ✅ Tests ALL functionality including cover deletion
- ✅ Validates production behavior
- ✅ Tests against real Firebase infrastructure

### What It Tests
1. ✅ Book creation with cover
2. ✅ Album auto-creation
3. ✅ **Cover updates with old cover deletion** ⭐
4. ✅ Standalone album creation
5. ✅ Media upload
6. ✅ `usedIn` tracking
7. ✅ Media deletion
8. ✅ Storage usage tracking
9. ✅ Book-Album synchronization

### Running
```bash
# Set credentials
export GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
export FIREBASE_PROJECT_ID="airabook-dev"

# Run tests
node functions/tests/run-production-media-tests.cjs
```

---

## Test Coverage Comparison

| Feature | Local Emulator | Production |
|---------|---------------|------------|
| Book Creation | ✅ | ✅ |
| Album Creation | ✅ | ✅ |
| Cover Upload | ✅ | ✅ |
| **Cover Update & Delete Old** | ⚠️ Limited | ✅ Full |
| Media Upload | ✅ | ✅ |
| Media Deletion | ✅ | ✅ |
| UsedIn Tracking | ✅ | ✅ |
| Storage Tracking | ✅ | ✅ |
| Book-Album Sync | ✅ | ✅ |

---

## Important Notes

### Cover Images are FREE
Cover images for books and albums are **NOT counted** in user storage quotas. Only media files (images/videos in albums) count toward storage.

```javascript
// ✅ FREE (not counted)
- Book covers
- Album covers

// 📊 COUNTED (tracked in storage)
- Media in albums (images/videos)
- Media attached to pages
```

### Storage Tracking
The tests verify that:
1. Cover uploads don't increment `storageUsage`
2. Media uploads DO increment `storageUsage`
3. Media deletions decrement `storageUsage`
4. Final storage matches expected calculations

### Test User Cleanup
Both test suites:
- Create a temporary test user
- Run all tests
- Clean up all data (user, books, albums, files)
- Leave no trace in your database

---

## Troubleshooting

### Local Tests Fail: "Emulator not running"
**Solution:** Start emulators first
```bash
npm run emulator
```

### Production Tests Fail: "GOOGLE_APPLICATION_CREDENTIALS not set"
**Solution:** Set environment variable
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
```

### Local Tests: SSL Error
**Expected:** The local tests use HTTP workarounds specifically to avoid this.
If you still see SSL errors, the workaround may need updating.

### Production Tests: Permission Denied
**Solution:** Ensure service account has proper roles:
- Firebase Admin
- Cloud Datastore User
- Storage Admin

---

## CI/CD Integration

### For Local/Emulator Tests
```yaml
- name: Run Emulator Tests
  run: |
    npm run emulator &
    sleep 10
    node functions/tests/run-local-media-tests.cjs
```

### For Production Tests
```yaml
- name: Run Production Tests
  env:
    GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.SERVICE_ACCOUNT_KEY }}
    FIREBASE_PROJECT_ID: airabook-dev
  run: |
    node functions/tests/run-production-media-tests.cjs
```

---

## Development Workflow

1. **During Development**
   - Use `run-local-media-tests.cjs`
   - Fast iteration
   - No Firebase costs

2. **Before Deployment**
   - Run `run-local-media-tests.cjs` (quick check)
   - Deploy to dev project
   - Run `run-production-media-tests.cjs` (full validation)

3. **After Deployment**
   - Run `run-production-media-tests.cjs` on staging
   - Verify all functionality works in production environment

---

## Adding New Tests

### To Local Tests
```javascript
await test("Your Test Name", async () => {
    // Use HTTP helpers for file operations
    const file = await uploadFileHTTP(path, buffer);
    
    // Use normal Firestore operations
    await db.collection("...").doc("...").set({...});
    
    // Assertions
    assert(condition, "message");
});
```

### To Production Tests
```javascript
await test("Your Test Name", async () => {
    // Use normal Admin SDK
    const file = await createTestImage(path, sizeKB);
    
    // Everything works normally
    await db.collection("...").doc("...").set({...});
    
    // Assertions
    assert(condition, "message");
});
```

---

## Questions?

- **Which test should I run?** 
  - Development: Local
  - Pre-deployment: Both
  - Post-deployment: Production

- **Why two versions?**
  - Firebase Storage Emulator has SSL limitations
  - Production tests validate real behavior

- **Can I modify the tests?**
  - Yes! Add new test cases as needed
  - Keep both versions in sync

- **Do tests cost money?**
  - Local: No (emulator is free)
  - Production: Minimal (small test files, quick cleanup)
