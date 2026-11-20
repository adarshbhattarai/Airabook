# Book writing assistant

## Interaction and context

One `ChatPanel` is mounted per book. The single Ask AI launcher opens a docked right panel on wide screens and a drawer on small screens. The compact header, underlined Chat/Chapter ideas tabs, unboxed assistant replies and small composer use theme tokens in light, dark and matrix modes. Replies render CommonMark through `react-markdown`, without enabling raw HTML.

The context control has four choices:

- **Follow editor** (default): the active page in page view, selected chapter in its overview, or the whole book when no chapter is selected.
- **Entire book**: pins the book, excluding the editor's current chapter and page from the request.
- **Choose chapter**: pins any chapter in this book without navigating the editor.
- **Choose page**: drills down through a chapter to pin a saved page. New temporary pages must be saved before they can be pinned; Follow editor already supports their live drafts.

The page chooser loads the selected chapter’s canonical page collection on demand, so older or incomplete `pagesSummary` indexes do not hide saved pages. It shows loading, empty, and retry states.

The selected context is shown above the tabs, with Following editor or Pinned. Each user message records the context label at send time. Changes affect subsequent requests; previously issued action/approval cards retain their request's context. Closing the assistant retains the conversation, context selection and unfinished composer for the mounted book. Switching books remounts it. Context does not create a new conversation or load old histories.

Chapter ideas use the context's chapter, including when it is pinned while the editor shows another chapter. Whole-book context asks the user to choose a chapter for these chapter-specific suggestions. Suggestions use the existing Firebase callable and per-user/book/chapter cache. A changed chapter summary does not trigger a new generation automatically: Refresh explicitly uses the latest stored summary. Selecting a suggestion fills the composer without sending it.

## Existing stream contract, additive writing context

`POST /api/v1/chat/stream` keeps authenticated Firebase bearer tokens, `contextType: ASSISTANT`, book-level `scopeId`, existing SSE events, cards and approvals. Selecting a chapter does not change `contextType` to CHAPTER, whose backend restrictions differ.

```json
{
  "contextType": "ASSISTANT",
  "inputMode": "TEXT",
  "scopeId": "book-id",
  "message": "Help me develop this scene",
  "conversationId": "existing-id-if-available",
  "metadata": {
    "source": "book_assistant",
    "contextScope": "page",
    "bookId": "book-id",
    "chapterId": "chapter-id",
    "pageId": "page-id"
  },
  "uiContext": {
    "surface": "book_writer",
    "scope": "page",
    "book": { "id": "book-id", "title": "Book title" },
    "chapter": { "id": "chapter-id", "title": "Chapter title", "summary": "Saved chapter summary" },
    "page": {
      "id": "page-id",
      "title": "Page title",
      "text": "A snapshot of the page at send time",
      "isDraft": true,
      "truncated": false
    }
  }
}
```

Chapter context omits the page. Whole-book context omits both chapter and page, and supplies a table of contents capped at 100 chapter IDs/titles. Chapter summary hints are capped at 1,200 characters. Page text is capped at 12,000 characters and marked truncated when longer. The active editor supplies live BlockNote/template text, including unsaved changes; pages outside the active editor are read through authenticated Firestore. Pinned chapter summaries are reread at send time. Missing or deleted documents produce an error rather than silently switching context.

UI context is source material and a focus hint, not proof of access or a hard RAG filter. The backend must still authorize canonical data/tool access. This change does not add a retrieval engine or an overwrite-page mutation: planner targets remain book/chapter based and approvals remain in force.

## Spring boundary

In sibling `../Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java`:

- The Alibaba chat path already appends `uiContext` as ephemeral model context.
- Planner requests now receive the same ephemeral context in `distributionPrompt`.
- Explicit `book_writer` / `scope: book` prevents the chapter from an earlier conversation turn being inferred as the current chapter.

No public DTO or Firestore schema change is required. Restart/deploy the Spring service to load these changes. The optional ADK path receives page IDs in metadata; draft-aware ADK context consumption and full retrieval quality are outside this UI change.

## Verification

`e2e/writing-assistant-context.spec.mjs` uses the seeded demo-project account and mocked AI. It verifies live draft snapshots, page/chapter/book payloads, pinning across editor navigation, suggestions using pinned chapter context, explicit send, menu Escape/focus, Markdown rendering, mobile fit, and light/dark/matrix screenshots. It runs in the normal serial local QA suite alongside existing assistant/navigation regressions. Spring `UnifiedChatStreamServiceTest` covers whole-book context clearing stale chapter history and page snapshots reaching planner requests. Model quality is not established by these deterministic tests.
