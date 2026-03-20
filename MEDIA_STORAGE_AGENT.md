# Media Storage Agent

Use this file when a task touches Firebase Storage uploads, media deletion, album sync, or storage quota tracking in Airabook.

For local Genkit UI work, keep your Gemini key in `functions/.env.genkit.local` and start the runtime with `npm run genkit:local` from `functions/`.

## Current Model

The current book/album media pipeline is **direct client upload to Firebase Storage** plus **server-side Firebase Storage triggers** for post-upload and post-delete bookkeeping.

This means:
- The browser uploads files directly with the Firebase Storage SDK.
- Storage rules decide whether the signed-in user can write to the target path.
- `functions/mediaProcessor.js` is the authoritative place for:
  - album creation/sync
  - media registry updates
  - cover image updates
  - `usedIn` tracking
  - `storageBytesUsed` changes via quota helpers
  - rollback when quota is exceeded

The trigger does **not** proxy the file bytes today. It reacts after Storage has accepted the upload.

## Source Of Truth Files

- `/Users/adeshbhattarai/code/Airabook/storage.rules`
- `/Users/adeshbhattarai/code/Airabook/functions/mediaProcessor.js`
- `/Users/adeshbhattarai/code/Airabook/functions/deleteMedia.js`
- `/Users/adeshbhattarai/code/Airabook/functions/utils/deleteMediaInternal.js`
- `/Users/adeshbhattarai/code/Airabook/src/components/PageEditor/index.jsx`
- `/Users/adeshbhattarai/code/Airabook/src/services/photoPlannerMediaService.js`
- `/Users/adeshbhattarai/code/Airabook/src/pages/AlbumDetail.jsx`

## Path Contract

The trigger expects media paths in this format:

```text
{userId}/{bookOrAlbumId}/{chapterId}/{pageId}/media/{image|video}/{fileName}
```

Examples:

- Page upload: `{uid}/{bookId}/{chapterId}/{pageId}/media/image/{file}`
- Album-level upload: `{uid}/{albumId}/_album_/_album_/media/image/{file}`

Other direct client upload paths in the UI today:

- Profile avatar: `{uid}/avatars/{file}`
- Book cover: `{uid}/covers/{file}`
- New standalone album cover before album creation: `{uid}/covers/{file}`
- Existing album cover: `{uid}/albums/{albumId}/{file}`

The `_album_/_album_` placeholders mean "this belongs to the album registry, not a specific page".

For shared books, the first path segment should still be the **owning user's UID**, not the acting co-author's UID.
That means:

- owner upload to shared book media: `{ownerUid}/{bookId}/{chapterId}/{pageId}/media/...`
- co-author upload with `canManageMedia`: also `{ownerUid}/{bookId}/{chapterId}/{pageId}/media/...`
- linked book album media: `{ownerUid}/{bookId}/_album_/_album_/media/...`

Storage rules should validate both:
- whether the acting user is allowed to manage media for the target book/album
- whether the path root matches the target owner's UID

If you change this path format, you must update:
- `storage.rules`
- `functions/mediaProcessor.js`
- every client uploader
- any delete helper that parses `storagePath`

## Upload Flow

### 1. Browser upload

The current UI uploaders use `uploadBytesResumable(...)` directly:
- page editor uploads in `/Users/adeshbhattarai/code/Airabook/src/components/PageEditor/index.jsx`
- planner uploads in `/Users/adeshbhattarai/code/Airabook/src/services/photoPlannerMediaService.js`
- album uploads in `/Users/adeshbhattarai/code/Airabook/src/pages/AlbumDetail.jsx`

They attach `customMetadata` such as:
- `originalName`
- `bookId`
- `albumId`
- `mediaType`

### 2. Storage rules gate access

`/Users/adeshbhattarai/code/Airabook/storage.rules` allows client media writes only when:
- the user is signed in
- `request.auth.uid` matches the first path segment
- the target book or standalone album grants media access

Important:
- book media access is based on the `books/{bookId}` doc
- standalone album access is based on the `albums/{albumId}` doc
- deletes are server-only for normal users

### 3. `onMediaUpload` finalizes the media record

`/Users/adeshbhattarai/code/Airabook/functions/mediaProcessor.js` `onMediaUpload`:
- parses the storage path
- determines the billed user
- creates the album if needed
- generates a download URL
- inserts or updates the media item in `albums/{albumId}`
- initializes `usedIn` for page-origin uploads
- increments storage usage with `addStorageUsage(...)`
- rolls back the upload if quota enforcement fails

This is the main place to adjust post-upload behavior.

## Delete Flow

### Asset deletion

Asset deletion should go through Firebase Functions, not direct client Storage delete.

Primary callable:
- `/Users/adeshbhattarai/code/Airabook/functions/deleteMedia.js`

`deleteMediaAsset`:
- validates auth and ownership/access
- deletes the object from Storage with Admin SDK
- relies on `onMediaDelete` for cleanup

### `onMediaDelete` cleanup

`/Users/adeshbhattarai/code/Airabook/functions/mediaProcessor.js` `onMediaDelete`:
- removes the media item from the album
- updates cover image and media count
- removes page references using `usedIn`
- updates accessible album/book projections
- decrements storage usage

## Storage Usage Rule

`storageBytesUsed` must be treated as **server-authoritative**.

Do not increment or decrement quota counters in client code for normal media uploads/deletes.

Use:
- `functions/utils/limits.js`
- `addStorageUsage(...)`

Quota changes should happen in:
- `onMediaUpload`
- `onMediaDelete`
- controlled admin cleanup helpers

Important product policy:
- `storageBytesUsed` is for tracking and quota visibility
- uploads should increase it
- deletes should decrease it
- plain stored bytes should **not** deduct credits on a daily schedule

If billing logic is touched, also open:
- `/Users/adeshbhattarai/code/Airabook/AI_CREDIT_STORAGE_POLICY.md`

## Important Current Caveat

There is also an older HTTP upload function in:

- `/Users/adeshbhattarai/code/Airabook/functions/imageProcessor.js`

That is **not** the main book/album media pipeline today. It uploads to a different path shape and should be treated as legacy unless you intentionally migrate back to server-mediated upload.

## If You Want To Change The Design Later

### If keeping direct client upload

Keep this contract:
- client writes bytes
- rules authorize write
- trigger performs metadata sync and quota updates

### If moving upload behind a Firebase Function

You will need to change all of these together:
- client uploaders in `src/`
- the upload function contract
- storage path generation
- quota ownership logic
- trigger assumptions, if the new function writes different metadata or paths

If you do this, keep the trigger as the post-write source of truth unless you deliberately replace it with a single server transaction model.

## Quick Prompt For Future Agents

Use this when you want a future Codex session to recover the pattern quickly:

```text
Open /Users/adeshbhattarai/code/Airabook/MEDIA_STORAGE_AGENT.md first.
This repo currently uses direct client uploads to Firebase Storage, with Storage rules for authorization and Firebase Storage triggers in functions/mediaProcessor.js for album sync, usedIn updates, cover updates, and storageBytesUsed quota tracking. Do not move quota math into the client. If changing upload/delete behavior, trace storage.rules, the uploader in src/, and functions/mediaProcessor.js together.
```
