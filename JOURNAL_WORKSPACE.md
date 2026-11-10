# Journal writing workspace

## Product decisions

- A page is a named journal entry or knowledge note. It can grow vertically; it is not a fixed amount of text.
- Pages appear in a vertical sequence within the selected chapter. The outline jumps directly to a page; normal scrolling does not change its content or move blocks to another entry.
- The standard layout does not paginate or reflow blocks automatically. A4 and scrapbook layouts retain their fixed paper behavior.
- A compact page header shows its chapter, page position, save status, word count, reading time, Save and New page. The More menu contains Copy page link, Rewrite page, Length guide, Generate Clip, and Delete page.
- One writing assistant opens from Ask AI, with chapter suggestions in its Chapter ideas tab. See [the writing assistant contract](WRITING_ASSISTANT.md). It starts collapsed to give writing more space. Chapter conversation transfer and media-planning launch points are hidden while the journaling and chapter-writing experience is the focus.
- New page explicitly starts an entry after the current page. Format switching, automatic daily entries, and document ingestion controls are deferred until their behavior is defined.

## Length guidance

The default personal guide is 400 words. It can be changed to 800 or 1,200 words, or switched off, from More page options > Length guide. The preference is stored per book in the browser under `airabook:writing-guide:{bookId}` and shared by the book's mounted editors. It is not an account policy or a shared author setting.

The guide never blocks writing or saving. A longer entry displays a quiet suggestion to start a page when the topic changes. It does not apply an orange physical-page border or mask the end of a journal entry.

Word counts are calculated from written text, including nested blocks, links, and table cells, without counting media URLs and metadata. They are not a tokenizer or an embedding guarantee. The existing 512 KB / 10,000-line technical safety limits still apply; plan quotas for the number of pages remain separate.

## Navigation and persistence

- Explicit page selection keeps the existing `/book/{bookId}?chapter={chapterId}&page={pageId}` deep link.
- A vertical reading anchor identifies the active page even when an entry is much taller than the viewport. Intersection percentage is unsuitable for very long notes.
- Voice page context follows the active entry. Clicking the current outline entry returns to its start, and chapter continuation opens the next chapter's first entry with its page deep link.
- Sidebar page/chapter navigation, adding a page through the outline, Preview, and Back to books wait for all dirty mounted entries to save. Save failure keeps the writing screen open.
- Chapter fetches and snapshots retain their source chapter and reject late results from a chapter that is no longer selected.
- Replacing a temporary page ID clears the draft version that was just saved while preserving a newer draft created during the save.

## Company knowledge and Gurkha Encounters

The product direction is one authoring surface for private journals and company knowledge, with controlled source selection for customer chat. The hierarchy in `../Documents/Proposed Airabook Hierarchical RAG Architecture.pdf` is account > book > document > chapter/section > exact page or passage. Memory summaries route the question; original source text supports the answer and its citation.

Writing-page boundaries should remain stable human references. Backend retrieval units can be smaller sections or passages inside one long page. A word guide cannot replace extraction, model token checks, passage retrieval, or citation validation.

Current boundaries checked on 2026-10-31:

- `functions/syncPageDerivedData.js` still generates one embedding from the page's full `plainText`; there is no passage index here yet.
- Spring's `PageTools.searchRelevantPages` carries book/chapter/page IDs, but its current `VectorSearchService.generateEmbedding` is a stub. This frontend change does not repair or complete that service.
- `../SDK/IMPLEMENTATION_CONTEXT.md` describes the campaign widget and dedicated Spring engagement WebSocket. Its bounded public tools provide campaign details; Gurkha source-document retrieval is not connected.
- The page media picker currently supports images and videos. A document-upload button would need a supported extraction/processing and source-status contract before it belongs in this toolbar.

The next retrieval slice should preserve account and access scope, original document, section/page references, source version, and processing status. Campaign retrieval must use approved company sources; private journal entries must not become visitor-chat knowledge merely because they share the editor.

## Ownership and verification

- `src/pages/BookDetail.jsx`: vertical sequence, selected/active page navigation, persistence before navigation.
- `src/components/PageEditor/WritingPageHeader.jsx`: page actions, AI instruction dialog, guide preference menu, source-link copy.
- `src/hooks/useWritingPreferences.js`: per-book browser preference.
- `src/lib/pageWritingStats.js`: text-only writing statistics.
- `src/hooks/usePaginationReflow.js`: explicitly enabled only for editable fixed paper layouts.
- `e2e/chapter-navigation.spec.mjs`: exact long-entry text, vertical geometry, independent drafts, resize, chapter changes, reload, optional guidance, AI tool entry, chapter continuation, and inserting a page between stable neighbors.

Run against the isolated `demo-project` local profile:

```sh
node --test src/lib/pageWritingStats.test.mjs
PLAYWRIGHT_USE_EMULATOR=true PLAYWRIGHT_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/chapter-navigation.spec.mjs --workers=1
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5176 npm run test:local:qa
```
