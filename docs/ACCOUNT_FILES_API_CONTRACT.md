# Account Files API Contract

This contract describes the Spring APIs required by the current Airabook file UI. The frontend sends the original bytes to Spring; it does not upload documents through Firebase Storage or the page media trigger. Uploading only stores and organizes files. Reading a DOCX may extract paragraph text for display; indexing, embeddings, book generation, and research are separate actions.

## Common requirements

- Base path: `/api/v1`
- Every request requires `Authorization: Bearer <Firebase ID token>`. Spring verifies the token and resolves the application user from the verified Firebase UID.
- `{accountId}` is the authorized PostgreSQL workspace account UUID. Never trust a client-supplied role or uploader ID.
- Keep files private in backend-managed storage. Do not return public Firebase URLs or expose internal object keys.
- The frontend currently limits files to **10 MiB** and accepts `.pdf`, `.md`, `.markdown`, and `.docx`. Spring must enforce the same size limit and validate extension, MIME type, and file content; do not trust the browser MIME type alone.
- Document types: `PDF`, `MARKDOWN`, `DOCX`. A completed upload is stored and attachable; it has not been indexed for AI search. DOCX preview is readable text and does not preserve Word layout.
- Return JSON errors with a useful `message`, for example `{ "message": "Files must be 10 MiB or smaller." }`. The frontend surfaces that message.

## Routes

| Operation | Method and path | Request | Success |
| --- | --- | --- | --- |
| Upload original bytes | `POST /api/v1/accounts/{accountId}/upload` | Multipart fields `file` and `scope` | `201 Created`, one file record |
| List account files | `GET /api/v1/accounts/{accountId}/files` | Pagination, sorting, and optional filters | `200 OK`, page envelope with file records |
| Get file metadata | `GET /api/v1/accounts/{accountId}/files/{fileId}` | No body | `200 OK`, one file record with references and `canDelete` |
| Read PDF/Markdown/DOCX | `GET /api/v1/accounts/{accountId}/files/{fileId}/content` | No body | `200 OK`, private inline content response |
| Execute PDF into a book | `POST /api/v1/accounts/{accountId}/files/{fileId}/execute` | JSON operation and destination | `202 Accepted`, queued execution |
| Get PDF execution status | `GET /api/v1/accounts/{accountId}/files/{fileId}/executions/{executionId}` | No body | `200 OK`, execution status |
| Add conversation/page reference | `POST /api/v1/accounts/{accountId}/files/{fileId}/references` | JSON reference object | `201 Created`, one reference record |
| Remove a reference | `DELETE /api/v1/accounts/{accountId}/files/{fileId}/references/{referenceId}` | No body | `204 No Content` |
| Permanently delete a file | `DELETE /api/v1/accounts/{accountId}/files/{fileId}` | No body | `204 No Content`, original and links deleted |

The frontend accepts a legacy bare array while the backend transitions to a paginated `{ "items": [...], ... }` response. It also supports a direct file object or a `{ "data": { ... } }` envelope for upload responses.

## 1. Upload

### Request

```http
POST /api/v1/accounts/{accountId}/upload
Authorization: Bearer <Firebase ID token>
Content-Type: multipart/form-data; boundary=...
```

Multipart fields:

| Field | Type | Required | Values |
| --- | --- | --- | --- |
| `file` | Binary file | Yes | PDF, Markdown, or DOCX; maximum 10 MiB |
| `scope` | String | Yes | `library`, `conversation`, or `page` |

Example form fields (the browser creates the multipart boundary):

```text
file: research-notes.pdf
scope: conversation
```

The current frontend does not send a conversation ID, page ID, storage path, uploader ID, or idempotency header in this request. Link the file to a specific conversation or page with the reference route after upload. Do not require an idempotency header unless the frontend contract is extended.

### Success response

Return the canonical file record directly with `201 Created`:

```json
{
  "id": "file_01J...",
  "accountId": "8b163c99-6b96-4ccc-a386-765ae5809a4b",
  "name": "research-notes.pdf",
  "mimeType": "application/pdf",
  "documentType": "PDF",
  "sizeBytes": 184320,
  "status": "READY",
  "scope": "conversation",
  "references": [],
  "createdAt": "2026-11-15T16:20:00Z"
}
```

`READY` means the bytes are stored and can be attached. It does **not** mean text extraction or AI processing has run. The UI treats the returned `id` as the file ID for later reference calls.

### Validation and errors

- `400 Bad Request`: missing fields, malformed filename, unsupported type, or invalid scope.
- `401 Unauthorized`: missing or invalid Firebase token / application user.
- `403 Forbidden`: inactive account/member or insufficient upload permission.
- `404 Not Found`: account is missing or not visible to the caller.
- `413 Content Too Large`: file exceeds 10 MiB.
- `415 Unsupported Media Type`: content does not match PDF, Markdown, or DOCX.

## 2. List files

### Request

```http
GET /api/v1/accounts/{accountId}/files?page=0&size=25&sortBy=createdAt&direction=desc&location=all
Authorization: Bearer <Firebase ID token>
```

### Query parameters

| Parameter | Type | Required | Contract |
| --- | --- | --- | --- |
| `page` | Integer | No | Zero-based page number; default `0`, minimum `0` |
| `size` | Integer | No | Page size; default `25`, minimum `1`, maximum `100` |
| `sortBy` | String | No | `name`, `documentType`, `sizeBytes`, or `createdAt`; default `createdAt` |
| `direction` | String | No | `asc` or `desc`; default `desc` |
| `documentType` | String | No | `PDF`, `MARKDOWN`, or `DOCX` |
| `location` | String | No | `all`, `conversation`, `page`, or `unlinked`; default `all` |
| `minSizeBytes` | Integer | No | Inclusive lower size bound |
| `maxSizeBytes` | Integer | No | Inclusive upper size bound |
| `q` | String | No | Case-insensitive substring match on the sanitized filename |
| `uploadedAfter` | String | No | ISO-8601 timestamp lower bound |
| `uploadedBefore` | String | No | ISO-8601 timestamp upper bound |

`location=conversation` and `location=page` match the corresponding original upload scope or a current reference of that type. `location=unlinked` returns records without references or convenience target IDs. Reject invalid sort fields, directions, negative sizes, or inverted size/date ranges with `400 Bad Request`; never interpolate arbitrary sort input into SQL.

### Success response

Return `200 OK` with a page envelope, including the full `references` array for each returned file. Use a stable ID tie-breaker after the requested sort so records do not move between pages when their sort values match.

| Field | JSON type | Required | Contract |
| --- | --- | --- | --- |
| `items` | Array | Yes | File records for this page |
| `page` | Integer | Yes | Zero-based page returned |
| `size` | Integer | Yes | Page size applied |
| `totalItems` | Integer | Yes | Number of records after filters |
| `totalPages` | Integer | Yes | Number of result pages; `0` when there are no matches |
| `hasNext` | Boolean | Yes | Whether a following page exists |
| `hasPrevious` | Boolean | Yes | Whether a preceding page exists |
| `sortBy` | String | Yes | Sort field applied |
| `direction` | String | Yes | Sort direction applied |

Each `items` record must use this response contract:

| Field | JSON type | Required | Contract |
| --- | --- | --- | --- |
| `id` | String | Yes | Stable file ID used in reference routes |
| `accountId` | String (UUID) | Yes | Owning account ID |
| `name` | String | Yes | Sanitized display filename |
| `mimeType` | String | Yes | Detected/normalized MIME type |
| `documentType` | String | Yes | `PDF`, `MARKDOWN`, or `DOCX` |
| `sizeBytes` | Integer | Yes | Original file size in bytes |
| `status` | String | Yes | `READY` means stored and attachable; not indexed for AI search |
| `scope` | String | Yes | `library`, `conversation`, or `page`; a UI filter hint, not authorization |
| `canDelete` | Boolean | Yes | Whether the current user may permanently delete this file |
| `references` | Array | Yes | Empty array when unreferenced; otherwise all current references |
| `conversationId` | String or `null` | Yes | Convenience value from a conversation reference; `null` if none |
| `bookId` | String or `null` | Yes | Convenience value from a page reference; `null` if none |
| `chapterId` | String or `null` | Yes | Convenience value from a page reference; `null` if none |
| `pageId` | String or `null` | Yes | Convenience value from a page reference; `null` if none |
| `createdAt` | String (ISO-8601 timestamp) | Yes | Upload creation time, preferably UTC |

Each `references` item must contain a stable `id`, `type` (`conversation` or `page`), the applicable target IDs, and `createdAt`. A conversation reference requires `conversationId`; `bookId`, `chapterId`, and `pageId` are optional. A page reference requires `bookId`, `chapterId`, and `pageId`.

If a file has no reference, return `references: []` and `null` for all four convenience IDs. If it has multiple references, return all of them in `references`; the convenience IDs may represent the newest matching reference. Do not return public download URLs or internal storage object keys.

```json
{
  "items": [
    {
    "id": "file_01J...",
    "accountId": "8b163c99-6b96-4ccc-a386-765ae5809a4b",
    "name": "research-notes.pdf",
    "mimeType": "application/pdf",
    "documentType": "PDF",
    "sizeBytes": 184320,
    "status": "READY",
    "scope": "conversation",
    "references": [
      {
        "id": "ref_01J...",
        "type": "conversation",
        "conversationId": "conversation-123",
        "bookId": "book-123",
        "chapterId": "chapter-123",
        "pageId": "page-123",
        "createdAt": "2026-11-15T16:21:00Z"
      }
    ],
    "conversationId": "conversation-123",
    "bookId": "book-123",
    "chapterId": "chapter-123",
    "pageId": "page-123",
    "createdAt": "2026-11-15T16:20:00Z"
    }
  ],
  "page": 0,
  "size": 25,
  "totalItems": 1,
  "totalPages": 1,
  "hasNext": false,
  "hasPrevious": false,
  "sortBy": "createdAt",
  "direction": "desc"
}
```

The client falls back to local filtering, sorting, and paging when an older backend returns a bare array. That fallback is for transition compatibility; the backend should implement the page envelope to avoid returning every file for each table request.

## 3. Add a reference

### Conversation reference request

Dashboard chat sends the conversation ID. The writing assistant may also include its book/page context:

```http
POST /api/v1/accounts/{accountId}/files/{fileId}/references
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

```json
{
  "type": "conversation",
  "conversationId": "conversation-123",
  "bookId": "book-123",
  "chapterId": "chapter-123",
  "pageId": "page-123"
}
```

For dashboard chat, only `type` and `conversationId` are sent; the other fields are optional.

### Page reference request

```json
{
  "type": "page",
  "bookId": "book-123",
  "chapterId": "chapter-123",
  "pageId": "page-123"
}
```

### Success response

Return a stable reference record directly with `201 Created`:

```json
{
  "id": "ref_01J...",
  "fileId": "file_01J...",
  "type": "page",
  "bookId": "book-123",
  "chapterId": "chapter-123",
  "pageId": "page-123",
  "createdAt": "2026-11-15T16:21:00Z"
}
```

The page editor accepts this direct response or `{ "reference": { ... } }`. A repeated identical reference should be idempotent and return the existing reference rather than create duplicates.

Reject unsupported reference types and incomplete targets with `400`. Verify the file belongs to `{accountId}`. For conversation references, verify the caller can access that conversation. For page references, verify book/chapter/page ownership and the caller's page attachment permission, including co-author **Manage media** permission where applicable.

## 4. Remove a reference

```http
DELETE /api/v1/accounts/{accountId}/files/{fileId}/references/{referenceId}
Authorization: Bearer <Firebase ID token>
```

Return `204 No Content`. This removes only that relationship. **Do not delete the original file** when a page or conversation reference is removed. The My files library should continue to list it.

## 5. Permanently delete a stored file

```http
DELETE /api/v1/accounts/{accountId}/files/{fileId}
Authorization: Bearer <Firebase ID token>
```

Return `204 No Content` when cleanup completes. This is separate from deleting one reference.
Recheck active account membership and allow only the uploader, workspace owner, or workspace
administrator to delete. Include `canDelete` on file list and metadata responses so the frontend can
hide the action for users without permission. Mark the file `DELETE_PENDING` before cleanup so it is
immediately hidden from listing and metadata reads; remove references and any associated knowledge
index, then delete the original Storage object and metadata. If cleanup fails, keep it hidden and
retry on the backend schedule; `503 Service Unavailable` may report that cleanup is pending. Make
repeated delete requests safe. Return a safe `404` for unavailable files and `403` for insufficient
permission.

## 6. Execute a PDF into a book

The My files table exposes **Execute** for PDF files. This is an explicit, asynchronous action. It converts the selected PDF into book content and either creates a new book or appends a new chapter to an existing book. It does not overwrite existing chapters, and it does not delete or replace the source file.

```http
POST /api/v1/accounts/{accountId}/files/{fileId}/execute
Authorization: Bearer <Firebase ID token>
Content-Type: application/json
```

Create a new book (the frontend pre-fills the title from the PDF filename and lets the user edit it):

```json
{
  "operation": "PDF_TO_BOOK",
  "destination": {
    "type": "NEW_BOOK",
    "title": "Effective Java"
  }
}
```

Append the PDF content to a selected book as a new chapter:

```json
{
  "operation": "PDF_TO_BOOK",
  "destination": {
    "type": "EXISTING_BOOK",
    "bookId": "book-123",
    "placement": "NEW_CHAPTER"
  }
}
```

Return `202 Accepted` after validating access and enqueueing the work:

```json
{
  "executionId": "exec_01J...",
  "fileId": "file_01J...",
  "operation": "PDF_TO_BOOK",
  "status": "QUEUED",
  "destination": {
    "type": "EXISTING_BOOK",
    "bookId": "book-123",
    "title": null,
    "placement": "NEW_CHAPTER"
  },
  "statusUrl": "/api/v1/accounts/8b163c99-6b96-4ccc-a386-765ae5809a4b/files/file_01J.../executions/exec_01J...",
  "createdAt": "2026-11-15T16:20:00Z"
}
```

The frontend displays the returned queued message. It may poll the status URL to show progress and completion. The status response should include `executionId`, `fileId`, `operation`, `status` (`QUEUED`, `EXTRACTING`, `GENERATING`, `WRITING`, `COMPLETED`, or `FAILED`), `progress` when available, `resultBookId` when complete, `errorCode` on failure, and `updatedAt`. Validate PDF type, account membership, book ownership/write permission, and title. Repeated submissions for the same active file and destination should return or reuse the active execution rather than create duplicate books or chapters.

This is distinct from `POST /api/v1/accounts/{accountId}/knowledge/documents/{sourceDocumentId}/extract`, which indexes a source for account knowledge search; that route does not create a book or append chapters.

## 7. Read a stored document

```http
GET /api/v1/accounts/{accountId}/files/{fileId}/content
Authorization: Bearer <Firebase ID token>
Accept: application/pdf, text/markdown, text/plain
```

Return content according to the registered file type:

| Stored type | Response content | Frontend reader |
|---|---|---|
| PDF | Original bytes with `Content-Type: application/pdf` | Browser's native PDF viewer |
| Markdown | Original UTF-8 bytes with `Content-Type: text/markdown; charset=UTF-8` | Rendered Markdown view; raw HTML and remote images are not rendered |
| DOCX | Extracted paragraph text with `Content-Type: text/plain; charset=UTF-8` | Readable text view; Word page layout and formatting may differ |

Set `Content-Disposition: inline` with a sanitized filename, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. Require active workspace read access and verify that the file belongs to `{accountId}`. Return `415 Unsupported Media Type` for other file types, `404 Not Found` when the file or object is unavailable, and an appropriate client error if a DOCX cannot be safely read. Never return a public or persistent download URL.

The frontend fetches this route with the Firebase bearer token. It creates an in-memory object URL for PDFs and revokes it when the preview closes. Markdown and DOCX content stays in component state and is cleared when the preview closes. The URL or document body is not stored in Firestore or the file registry. Previewing only displays the document; it does not trigger Execute, extraction, indexing, or AI research.

## Authorization and CORS

- Enforce active Firebase identity, active application user, active account, and active account membership on every operation. Use the backend's workspace authorization service; the account ID in the URL is context, not proof of access.
- Personal workspaces require the Personal owner. Enterprise uploads and listing must follow the product's workspace role policy. Page references additionally require the page-level permission described above.
- The upload request currently has `scope` but no destination IDs. If non-admin co-authors need to upload page attachments, allow them to stage an account file and enforce page permission when the reference is created; otherwise the upload contract must add the target page IDs before upload.
- Allow browser origin `http://localhost:5173`; the local dev frontend runs there. CORS must allow `GET`, `POST`, `DELETE`, `OPTIONS` and headers including `Authorization` and `Content-Type`. Handle preflight `OPTIONS` before Firebase authentication; preflight does not carry the bearer token.

## Upload processing boundary

- Removing a page or conversation reference leaves the original file intact. The separate file DELETE route above removes the source and all its links.
- PDF, Markdown, and DOCX previews use the authenticated content route described above. Other file types cannot be previewed in this increment.
- Uploading does not automatically extract text, create embeddings, start research, or create book content. Indexing for document search and Execute are separate user-initiated actions. The existing knowledge-document extraction API indexes content for knowledge search; it does not create or update a book.

## Frontend endpoint overrides

- `VITE_SPRING_ACCOUNT_FILE_UPLOAD_ENDPOINT` defaults to `api/v1/accounts/{accountId}/upload`.
- `VITE_SPRING_ACCOUNT_FILES_ENDPOINT` defaults to `api/v1/accounts/{accountId}/files`.
- `VITE_SPRING_ACCOUNT_FILE_ENDPOINT` defaults to `api/v1/accounts/{accountId}/files/{fileId}`.
- `VITE_SPRING_ACCOUNT_FILE_REFERENCES_ENDPOINT` defaults to `api/v1/accounts/{accountId}/files/{fileId}/references`.
- `VITE_SPRING_ACCOUNT_FILE_DELETE_ENDPOINT` defaults to `api/v1/accounts/{accountId}/files/{fileId}`.


## My files: Vectorize and PDF destinations (frontend implemented; backend required)

My files now separates a one-way **Vectorize** switch (PDF and Markdown) from **Create book from PDF**.
The Spring source inspected on 2026-11-15 does not implement either file action route yet.
Existing knowledge extraction reads the legacy `knowledge-uploads`/Firestore source registry;
it must not be called with an `account_file` ID until a trusted adapter exists.

### Vectorize

`POST /api/v1/accounts/{accountId}/files/{fileId}/vectorize` with JSON `{}` and Firebase bearer auth.
Return `202` with `{ "fileId": "file-123", "status": "QUEUED" }` (optional job ID).
Resolve Storage key/generation from the authorized account-file record, support PDF and MARKDOWN,
extract/chunk/embed in a background job, and reuse an active/current job on repeated requests.
Do not create book content or publish sources. Enforce current account/file permissions and billing limits.
Unsupported types return 415; invalid access returns 403/404. Errors should contain a readable `message`.

Each file in GET list/detail must include `vectorization: { enabled, status, errorCode?, message? }`.
After a successful enable request the switch is checked and locked on; users cannot disable it.
Persist `enabled: true` even after processing failure. A separate Retry action retries failed jobs.
Network/rejected requests leave the switch off and show an error; they do not indicate enablement.
Statuses: `NOT_STARTED`, `QUEUED`, `EXTRACTING`, `INDEXING`, `READY`, `FAILED`.
Do not reuse the upload `status: READY` to mean vectorized. Refresh/reload reads the server status;
only indexing `READY` means searchable. A queued request alone is not completion.

Endpoint override: `VITE_SPRING_ACCOUNT_FILE_VECTORIZE_ENDPOINT`.
This initial action does not implement the previously planned per-book/chat search settings or sharing UI.

### Create pages inside a selected chapter

The existing `/files/{fileId}/execute` contract also accepts:

```json
{
  "operation": "PDF_TO_BOOK",
  "destination": {
    "type": "EXISTING_BOOK",
    "bookId": "book-123",
    "placement": "EXISTING_CHAPTER",
    "chapterId": "chapter-456"
  }
}
```

Append new pages to the selected chapter in source order. Verify account match, book write access,
and that the chapter belongs to that book. Preserve existing pages. Reject missing/deleted/unauthorized
destinations before queueing. `NEW_CHAPTER` and `NEW_BOOK` retain their existing payloads above.
The frontend loads chapter choices from the book's existing Firestore chapters ordered by `order`.
Return 202 with the execution contract above; retries must not duplicate active destination jobs.
Endpoint override: `VITE_SPRING_ACCOUNT_FILE_EXECUTE_ENDPOINT`.

The existing-book UI has one radio choice. After selecting a book, its chapter selector defaults
to “Create a new chapter”; selecting an existing chapter sends `placement: EXISTING_CHAPTER`
and `chapterId`. The two destination radio options are `NEW_BOOK` and `EXISTING_BOOK`.


## Compact My files controls

A fixed-width pinned panel uses three aligned slots: Read, Create/add to book, Delete.
Read is the one-way AI indexing switch and still calls authenticated
`POST /api/v1/accounts/{accountId}/files/{fileId}/vectorize` with `{}`. It does not open the preview.
The filename opens the readable preview. PDF and Markdown both offer book creation.
`POST /files/{fileId}/execute` uses `operation: PDF_TO_BOOK` for PDF and
`operation: MARKDOWN_TO_BOOK` for Markdown, with the same destination shapes.
Spring must validate operation against the trusted file type and implement Markdown conversion.
Unsupported formats show disabled controls in the same slots; deletion depends on `canDelete`.


## Optional English translation during book creation

Execute payloads include `translation: { enabled: false, sourceLanguage: "en", targetLanguage: null }`
by default. The dialog allows original language `en` (English) or `ne` (Nepali).
Switching Translate to English on sends `{ enabled: true, sourceLanguage: "ne", targetLanguage: "en" }`
when Nepali is selected. These options apply to PDF/Markdown and all book/chapter destinations.
Changing controls alone does not submit; Create pages sends the full execute request.
Spring must validate the language codes and translate generated page content only when enabled.
With `enabled: false`, preserve original language and skip translation entirely. English-to-English
can preserve the extracted text without calling translation. Include these options in job identity so
requests with different translation settings do not incorrectly reuse the same job. Translation never
changes the stored original or triggers vectorization. The controls reset to off/English on each opening.
The frontend sends these settings; implementing translation processing belongs to Spring.
