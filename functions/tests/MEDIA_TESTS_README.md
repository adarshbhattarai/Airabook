# Comprehensive Media & Storage Integration Tests

## Overview

This test suite provides end-to-end validation of the media management system, including:
- Book and album creation
- Media upload and storage tracking
- Asset selection and page attachment
- Cover image updates with old cover deletion
- Media deletion flows
- Storage usage calculations
- UsedIn functionality for tracking media usage across pages

## Prerequisites

### 1. Start Firebase Emulators
```bash
npm run emulator
```

This should start:
- Firestore Emulator (port 8080)
- Auth Emulator (port 9099)
- Storage Emulator (port 9199)
- Functions Emulator (port 5001)

### 2. Verify Emulators are Running
Check the emulator UI at: `http://localhost:4000`

## Running the Tests

### Run All Tests
```bash
node functions/tests/run-comprehensive-media-tests.cjs
```

### Expected Output
The test will create a temporary test user and run through all scenarios, providing detailed logging for each step.

## Test Coverage

### Test 1: Create Book with Cover (Auto-creates Album)
**What it tests:**
- Book creation with cover image
- Automatic album creation for books
- Cover image synchronization between book and album
- User document updates (accessibleBookIds, accessibleAlbums)

**Validates:**
- ✅ Book document created with correct fields
- ✅ Album auto-created with `type: "book"`
- ✅ Album cover matches book cover
- ✅ User has access to both book and album

**Storage Impact:**
- +50 KB (book cover image)

---

### Test 2: Create Second Book
**What it tests:**
- Creating multiple books for cross-book testing

**Validates:**
- ✅ Second book created successfully
- ✅ User can own multiple books

**Storage Impact:**
- None (no cover)

---

### Test 3: Create Standalone Album
**What it tests:**
- Creating albums independent of books
- Album type differentiation (`custom` vs `book`)

**Validates:**
- ✅ Album created with `type: "custom"`
- ✅ No `bookId` field (not linked to a book)
- ✅ User has access to standalone album

**Storage Impact:**
- None initially

---

### Test 4: Upload Media to Book's Album
**What it tests:**
- Media upload to album
- Storage usage tracking
- Media count updates

**Validates:**
- ✅ Images added to album's `images` array
- ✅ `mediaCount` incremented correctly
- ✅ User `storageUsage` updated
- ✅ Each image has empty `usedIn` array initially

**Storage Impact:**
- +100 KB (test image 1)
- +150 KB (test image 2)

---

### Test 5: Attach Media to Book Page (Track usedIn)
**What it tests:**
- Attaching album media to book pages
- `trackMediaUsage` Cloud Function
- `usedIn` array population

**Validates:**
- ✅ Chapter and page created
- ✅ Media attached to page's `media` array
- ✅ `usedIn` array updated in album
- ✅ `usedIn` contains correct `bookId`, `chapterId`, `pageId`

**Storage Impact:**
- None (references existing media)

**Key Assertion:**
```javascript
image.usedIn.length === 1
image.usedIn[0].pageId === pageRef.id
```

---

### Test 6: Update Book Cover (Delete old, add new)
**What it tests:**
- Cover image update flow
- Old cover deletion (storage leak prevention)
- Book-Album synchronization

**Validates:**
- ✅ Old cover deleted from storage
- ✅ New cover uploaded
- ✅ Book `coverImageUrl` updated
- ✅ Album `coverImage` updated (synced)
- ✅ Both documents point to same new cover

**Storage Impact:**
- +60 KB (new cover)
- -50 KB (old cover deleted)

**Critical Check:**
```javascript
const [oldCoverExists] = await oldCoverFile.exists();
assert(!oldCoverExists, "Old cover must be deleted");
```

---

### Test 7: Update Standalone Album Cover
**What it tests:**
- Album cover update for standalone albums
- No book synchronization (album not linked)

**Validates:**
- ✅ Old album cover deleted
- ✅ New album cover applied
- ✅ No book document affected

**Storage Impact:**
- +45 KB (new cover)
- -40 KB (old cover deleted)

---

### Test 8: Delete Single Media Item
**What it tests:**
- `deleteMediaAsset` Cloud Function
- `onMediaDelete` trigger
- Storage file deletion
- Album array updates
- Storage usage decrement

**Validates:**
- ✅ File deleted from storage
- ✅ Item removed from album's `images` array
- ✅ `mediaCount` decremented
- ✅ User `storageUsage` decremented
- ✅ Page references cleaned up (via `usedIn`)

**Storage Impact:**
- -100 KB (test image 1 deleted)

**Critical Checks:**
```javascript
const [fileExists] = await file.exists();
assert(!fileExists, "File must be deleted from storage");

const stillInAlbum = album.images.some(img => img.storagePath === deletedPath);
assert(!stillInAlbum, "Must be removed from album");
```

---

### Test 9: Verify Final Storage Usage
**What it tests:**
- Storage calculation accuracy
- Firestore `storageUsage` vs calculated total

**Validates:**
- ✅ All storage operations logged
- ✅ Calculated total matches Firestore value
- ✅ No storage leaks

**Calculation:**
```
Expected Storage = 
  + Book cover (60 KB)
  + Test image 2 (150 KB)
  + Standalone album cover (45 KB)
  = 255 KB
```

**Allows:** <1 KB difference for rounding

---

### Test 10: Verify UsedIn Tracking Integrity
**What it tests:**
- `usedIn` array accuracy
- Deleted media cleanup
- Active media tracking

**Validates:**
- ✅ Deleted image (testImage1) not in album
- ✅ Remaining image (testImage2) has correct `usedIn` status
- ✅ All page references are valid

**Output Example:**
```
Image 1: test-image-2.jpg
   Storage Path: userId/bookId/_album_/_album_/media/image/test-image-2.jpg
   Used In: 0 page(s)
```

---

### Test 11: Verify Firestore Document Cleanup
**What it tests:**
- Complete deletion verification
- No orphaned references

**Validates:**
- ✅ Deleted images not in Firestore
- ✅ Old covers not in storage
- ✅ Clean database state

---

## Understanding Test Output

### Success Output
```
================================================================================
🔵 TEST: 1. Create Book with Cover (Auto-creates Album)
================================================================================
[2025-12-02T...] 📚 Book created: abc123
[2025-12-02T...] ✅ Book and Album verified
✅ PASS: 1. Create Book with Cover (Auto-creates Album)
```

### Storage Tracking
```
[2025-12-02T...] 📊 Storage ADD: 51200 bytes - Book 1 cover image
[2025-12-02T...] 📊 Storage REMOVE: 51200 bytes - Old book cover deleted
```

### Final Summary
```
================================================================================
TEST SUMMARY
================================================================================
Total Tests: 12
✅ Passed: 12
❌ Failed: 0

🎉 All tests passed!
```

## Storage Operation Log

The test tracks every storage operation:

| Operation | Bytes | Description |
|-----------|-------|-------------|
| ADD | 51,200 | Book 1 cover image |
| ADD | 102,400 | Test image 1 uploaded |
| ADD | 153,600 | Test image 2 uploaded |
| ADD | 61,440 | New book cover uploaded |
| REMOVE | 51,200 | Old book cover deleted |
| REMOVE | 102,400 | Test image 1 deleted |
| ADD | 40,960 | Standalone album cover 1 |
| ADD | 46,080 | Standalone album cover 2 |
| REMOVE | 40,960 | Old standalone album cover deleted |

**Final Expected Storage:** 210,920 bytes

## Troubleshooting

### Test Fails: "Emulator not running"
**Solution:** Start emulators with `npm run emulator`

### Test Fails: "Old cover still exists"
**Issue:** Cover deletion not working
**Check:** 
- `updateBook.js` has `deleteCoverImage` helper
- `updateAlbum.js` has `deleteCoverImage` helper

### Test Fails: "Storage mismatch"
**Issue:** Storage calculations off
**Check:**
- All `addStorageUsage` calls
- `onMediaDelete` trigger running
- `deleteMediaAsset` function working

### Test Fails: "UsedIn not updated"
**Issue:** `trackMediaUsage` not working
**Check:**
- `trackMediaUsage` function exported
- `mediaUsage.js` logic correct

## What Each Test Validates

### Functional Requirements
- ✅ Books and albums can be created
- ✅ Media can be uploaded to albums
- ✅ Media can be attached to pages
- ✅ Covers can be updated
- ✅ Media can be deleted
- ✅ Albums can be standalone or book-linked

### Data Integrity
- ✅ Book and album covers stay in sync
- ✅ Deleted items removed from all references
- ✅ `usedIn` tracking accurate
- ✅ No orphaned files in storage
- ✅ No orphaned references in Firestore

### Storage Management
- ✅ Storage usage tracked accurately
- ✅ Old covers deleted when updated
- ✅ Deleted media decrements storage
- ✅ No storage leaks

## Running Specific Scenarios

To test specific functionality, you can modify the test file to run only certain tests:

```javascript
// Comment out tests you don't want to run
// await test("1. Create Book...", async () => { ... });
await test("6. Update Book Cover...", async () => { ... }); // Only run this
```

## Continuous Integration

Add to your CI pipeline:
```yaml
- name: Run Integration Tests
  run: |
    npm run emulator &
    sleep 10  # Wait for emulators
    node functions/tests/run-comprehensive-media-tests.cjs
```

## Next Steps

1. Run the test suite
2. Review the output logs
3. Verify all tests pass
4. Check storage calculations
5. Inspect Firestore documents in emulator UI
6. Validate `usedIn` tracking

## Questions?

If tests fail, check:
1. Are emulators running?
2. Are all Cloud Functions deployed/loaded?
3. Are there any console errors?
4. Does the emulator UI show the expected data?
