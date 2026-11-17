import { test, expect } from '@playwright/test';
import { mockPersonalWorkspaceAccess } from './helpers/personal-workspace.mjs';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
const bookId = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';
const chapterId = process.env.PLAYWRIGHT_CHAPTER_ID || 'chapter-001';

const setupFileApi = async (page, { name, mimeType, documentType }) => {
  const state = { files: [], uploadCalls: 0, references: [], deleteCalls: 0, deleteCleanupPending: false };
  await page.route('**/api/v1/accounts/smoke-personal/upload', async (route) => {
    state.uploadCalls += 1;
    const uploaded = {
      id: `file-e2e-${state.uploadCalls}`,
      name,
      documentType,
      mimeType,
      sizeBytes: 1024,
      status: 'READY',
      scope: 'library',
      canDelete: true,
      references: [],
      createdAt: '2026-11-13T12:00:00Z',
    };
    state.files = [...state.files, uploaded];
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(uploaded) });
  });
  await page.route(/\/api\/v1\/accounts\/smoke-personal\/files(?:\?.*)?$/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.files) });
  });
  await page.route(/\/api\/v1\/accounts\/smoke-personal\/files\/[^/]+$/, async (route) => {
    const fileId = route.request().url().match(/\/files\/([^/]+)$/)?.[1];
    if (route.request().method() === 'DELETE') {
      state.deleteCalls += 1;
      state.files = state.files.filter((file) => file.id !== fileId);
      if (state.deleteCleanupPending) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'File deletion is pending cleanup. Retry the delete request later.' }),
        });
        return;
      }
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const file = state.files.find((item) => item.id === fileId);
    await route.fulfill(file
      ? { status: 200, contentType: 'application/json', body: JSON.stringify(file) }
      : { status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'File was not found.' }) });
  });
  await page.route('**/api/v1/accounts/smoke-personal/files/*/references/*', async (route) => {
    const referenceId = route.request().url().match(/\/references\/([^/]+)$/)?.[1];
    state.files = state.files.map((file) => {
      const references = file.references.filter((reference) => reference.id !== referenceId);
      return { ...file, references, scope: references.length ? file.scope : 'library', ...(references.length ? {} : { bookId: '', chapterId: '', pageId: '', conversationId: '' }) };
    });
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route('**/api/v1/accounts/smoke-personal/files/*/references', async (route) => {
    if (route.request().method() === 'DELETE') {
      const referenceId = route.request().url().match(/\/references\/([^/]+)$/)?.[1];
      state.files = state.files.map((file) => {
        const references = file.references.filter((reference) => reference.id !== referenceId);
        return { ...file, references, scope: references.length ? file.scope : 'library', ...(references.length ? {} : { bookId: '', chapterId: '', pageId: '', conversationId: '' }) };
      });
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    const reference = route.request().postDataJSON();
    state.references.push(reference);
    const fileId = route.request().url().match(/\/files\/([^/]+)\/references/)?.[1];
    state.files = state.files.map((file) => file.id === fileId ? {
      ...file,
      scope: reference.type,
      ...reference,
      references: [...file.references, { ...reference, id: `reference-${state.references.length}` }],
    } : file);
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: `reference-${state.references.length}`, ...reference }) });
  });
  return state;
};

const signIn = async (page) => {
  test.skip(process.env.PLAYWRIGHT_USE_EMULATOR !== 'true', 'Authentication uses the isolated Firebase emulator.');
  test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run upload coverage.');
  await mockPersonalWorkspaceAccess(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
};

const chooseFileFromMenu = async (page, buttonName, file, buttonScope = page) => {
  await buttonScope.getByRole('button', { name: buttonName }).click();
  await page.getByRole('menuitem', { name: 'Upload files' }).click();
  await page.getByLabel('Choose files').setInputFiles(file);
};

test.describe('My files upload', () => {
  test('vectorizes PDF and Markdown independently from book creation and retries failures', async ({ page }) => {
    const api = await setupFileApi(page, {});
    api.files = ['PDF', 'MARKDOWN', 'DOCX'].map((type) => ({ id: type, name: `source.${type === 'PDF' ? 'pdf' : type === 'MARKDOWN' ? 'md' : 'docx'}`, documentType: type, mimeType: '', canDelete: true, sizeBytes: 1024 }));
    let attempts = 0;
    await page.route('**/files/*/vectorize', async (route) => {
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      expect(route.request().postDataJSON()).toEqual({});
      attempts += 1;
      if (attempts === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Please retry vectorization.' }) });
      const id = route.request().url().match(/files\/([^/]+)\/vectorize/)[1];
      api.files = api.files.map((file) => file.id === id ? { ...file, vectorization: { status: 'READY' } } : file);
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ status: 'QUEUED' }) });
    });
    await signIn(page);
    await page.goto('/files');
    const markdown = page.getByRole('row').filter({ hasText: 'source.md' });
    const pdf = page.getByRole('row').filter({ hasText: 'source.pdf' });
    await expect(markdown.getByRole('button', { name: 'Create book from source.md', exact: true })).toBeEnabled();
    await expect(page.getByRole('row').filter({ hasText: 'source.docx' }).getByRole('switch', { name: /^Read / })).toBeDisabled();
    await markdown.getByRole('switch', { name: /^Read / }).click();
    await expect(markdown.getByRole('alert')).toContainText('Please retry');
    await markdown.getByRole('switch', { name: /^Read / }).click();
    await expect(markdown.getByRole('switch', { name: /^Read / })).toBeChecked();
    await expect(markdown.getByRole('switch', { name: /^Read / })).toBeDisabled();
    await pdf.getByRole('switch', { name: /^Read / }).click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(markdown.getByText('Ready for AI search')).toBeVisible();
    await page.reload();
    await expect(pdf.getByRole('switch', { name: /^Read / })).toBeChecked();
    await expect(pdf.getByRole('switch', { name: /^Read / })).toBeDisabled();
    expect(attempts).toBe(3);
  });

  for (const type of ['PDF', 'MARKDOWN']) test(`creates ${type} content in a new book, new chapter, or selected chapter`, async ({ page }) => {
    const api = await setupFileApi(page, {});
    api.files = [{ id: 'convert-pdf', name: `Book source.${type === 'PDF' ? 'pdf' : 'md'}`, documentType: type, mimeType: type === 'PDF' ? 'application/pdf' : 'text/markdown', sizeBytes: 1024 }];
    const requests = [];
    await page.route('**/files/convert-pdf/execute', async (route) => {
      expect(route.request().headers().authorization).toMatch(/^Bearer /);
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ executionId: 'job-test', status: 'QUEUED' }) });
    });
    await signIn(page);
    await page.goto('/files');
    const open = page.getByRole('button', { name: `Create book from Book source.${type === 'PDF' ? 'pdf' : 'md'}`, exact: true });
    await open.click();
    let dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(requests).toHaveLength(0);
    await open.click();
    await dialog.getByRole('textbox', { name: 'New book title' }).fill('Imported book');
    await expect(dialog.getByRole('switch', { name: 'Translate to English' })).not.toBeChecked();
    await dialog.getByLabel('Original language').selectOption('ne');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests[0]).toEqual({ operation: type === 'PDF' ? 'PDF_TO_BOOK' : 'MARKDOWN_TO_BOOK', destination: { type: 'NEW_BOOK', title: 'Imported book' }, translation: { enabled: false, sourceLanguage: 'ne', targetLanguage: null } });
    await open.click();
    await dialog.getByRole('radio', { name: 'Add to an existing book', exact: false }).check();
    await dialog.getByLabel('Select a book').selectOption(bookId);
    await expect(dialog.getByLabel('Original language')).toHaveValue('en');
    await dialog.getByLabel('Original language').selectOption('ne');
    await dialog.getByRole('switch', { name: 'Translate to English' }).check();
    await expect(dialog.getByLabel('Select a chapter')).toBeEnabled();
    await expect(dialog.getByLabel('Select a chapter')).toHaveValue('');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests[1]).toEqual({ operation: type === 'PDF' ? 'PDF_TO_BOOK' : 'MARKDOWN_TO_BOOK', destination: { type: 'EXISTING_BOOK', bookId, placement: 'NEW_CHAPTER' }, translation: { enabled: true, sourceLanguage: 'ne', targetLanguage: 'en' } });
    await open.click();
    await dialog.getByRole('radio', { name: 'Add to an existing book', exact: false }).check();
    await dialog.getByLabel('Select a book').selectOption(bookId);
    await dialog.getByLabel('Select a chapter').selectOption(chapterId);
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(requests[2]).toEqual({ operation: type === 'PDF' ? 'PDF_TO_BOOK' : 'MARKDOWN_TO_BOOK', destination: { type: 'EXISTING_BOOK', bookId, placement: 'EXISTING_CHAPTER', chapterId }, translation: { enabled: false, sourceLanguage: 'en', targetLanguage: null } });
  });

  test('keeps file actions pinned while metadata scrolls underneath on desktop and mobile', async ({ page }) => {
    const api = await setupFileApi(page, {});
    api.files = [{ id: 'sticky-pdf', name: 'Pinned actions.pdf', documentType: 'PDF', mimeType: 'application/pdf', sizeBytes: 1024, canDelete: true }];
    await signIn(page);
    await page.goto('/files');
    const table = page.getByRole('table');
    const actions = page.getByTestId('file-actions');
    const header = page.getByRole('columnheader', { name: 'File actions', exact: true });
    for (const width of [1100, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ['light', 'dark', 'matrix']) {
        await page.evaluate((value) => { document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-matrix'); document.documentElement.classList.add(`theme-${value}`); }, theme);
        await table.evaluate((element) => { element.parentElement.scrollLeft = 0; });
        const before = await actions.boundingBox();
        const fileBefore = await page.getByRole('button', { name: 'Open PDF Pinned actions.pdf' }).boundingBox();
        await table.evaluate((element) => { element.parentElement.scrollLeft = element.parentElement.scrollWidth; });
        await expect.poll(async () => (await actions.boundingBox()).x).toBeCloseTo(before.x, 0);
        const after = await actions.boundingBox();
        const heading = await header.boundingBox();
        const fileAfter = await page.getByRole('button', { name: 'Open PDF Pinned actions.pdf' }).boundingBox();
        expect(fileAfter.x).toBeLessThan(fileBefore.x - 50);
        expect(Math.abs(heading.x - after.x)).toBeLessThan(2);
        expect(after.x + after.width).toBeLessThanOrEqual(width);
        expect(await actions.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      }
      await actions.getByRole('button', { name: 'Create book from Pinned actions.pdf' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await actions.getByRole('button', { name: 'Delete Pinned actions.pdf', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Delete this file permanently?');
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  });

  test('uploads a PDF through Spring and restores it from the file library', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'research-notes.pdf', mimeType: 'application/pdf', documentType: 'PDF' });
    await signIn(page);
    await page.getByRole('link', { name: 'My files', exact: true }).click();
    await page.waitForURL('**/files');
    await expect(page.getByRole('heading', { name: 'No files yet' })).toBeVisible();

    await chooseFileFromMenu(page, 'Upload files', {
      name: 'research-notes.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test fixture'),
    });

    const fileRow = page.getByRole('row').filter({ hasText: 'research-notes.pdf' });
    await expect(fileRow).toBeVisible();
    expect(api.uploadCalls).toBe(1);
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'research-notes.pdf' })).toBeVisible();
  });

  test('deletes an uploaded file and removes it from the library', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'delete-me.pdf', mimeType: 'application/pdf', documentType: 'PDF' });
    await signIn(page);
    await page.getByRole('link', { name: 'My files', exact: true }).click();
    await page.waitForURL('**/files');
    await chooseFileFromMenu(page, 'Upload files', {
      name: 'delete-me.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 delete fixture'),
    });

    const fileRow = page.getByRole('row').filter({ hasText: 'delete-me.pdf' });
    await expect(fileRow).toBeVisible();
    await fileRow.getByRole('button', { name: 'Delete delete-me.pdf' }).click();
    await expect(page.getByRole('heading', { name: 'Delete this file permanently?' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete file', exact: true }).click();

    await expect(fileRow).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No files yet' })).toBeVisible();
    expect(api.deleteCalls).toBe(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'No files yet' })).toBeVisible();
  });

  test('shows pending cleanup as removed when the backend hides a DELETE_PENDING file', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'cleanup-pending.pdf', mimeType: 'application/pdf', documentType: 'PDF' });
    await signIn(page);
    await page.getByRole('link', { name: 'My files', exact: true }).click();
    await page.waitForURL('**/files');
    await chooseFileFromMenu(page, 'Upload files', {
      name: 'cleanup-pending.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 cleanup fixture'),
    });

    const fileRow = page.getByRole('row').filter({ hasText: 'cleanup-pending.pdf' });
    await expect(fileRow).toBeVisible();
    api.deleteCleanupPending = true;
    await fileRow.getByRole('button', { name: 'Delete cleanup-pending.pdf' }).click();
    await page.getByRole('button', { name: 'Delete file', exact: true }).click();

    await expect(fileRow).toHaveCount(0);
    await expect(page.getByText('File removed from My files', { exact: true })).toBeVisible();
    expect(api.deleteCalls).toBe(1);
  });

  test('dashboard files appear on the message and link to its conversation', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'dashboard-notes.md', mimeType: 'text/markdown', documentType: 'MARKDOWN' });
    const streamRequests = [];
    await page.route('**/api/v1/chat/stream', async (route) => {
      const origin = route.request().headers().origin || '*';
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': route.request().headers()['access-control-request-headers'] || 'authorization, content-type',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      streamRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/event-stream' },
        body: `event: final\ndata: ${JSON.stringify({ text: 'Dashboard reply', conversationId: 'dashboard-file-e2e' })}\n\n`,
      });
    });
    await signIn(page);

    await chooseFileFromMenu(page, 'Add files', {
      name: 'dashboard-notes.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Research notes'),
    });
    await expect(page.getByText('dashboard-notes.md', { exact: true }).first()).toBeVisible();
    await page.locator('textarea').fill('Keep this document for a future research run.');
    await page.getByRole('button', { name: /Send/ }).last().click();

    await expect(page.getByText('Dashboard reply')).toBeVisible();
    await expect(page.getByText('Aira has not read these files.')).toBeVisible();
    await expect.poll(() => streamRequests.length).toBe(1);
    await expect.poll(() => api.references.length).toBe(1);
    expect(api.references[0]).toMatchObject({ type: 'conversation', conversationId: 'dashboard-file-e2e' });
    await page.goto('/files');
    await page.getByRole('tab', { name: 'Conversations' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'dashboard-notes.md' })).toBeVisible();
  });

  test('writing assistant files appear on its message and link to the active conversation', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'assistant-source.pdf', mimeType: 'application/pdf', documentType: 'PDF' });
    const streamRequests = [];
    await page.route('**/api/v1/chat/stream', async (route) => {
      const origin = route.request().headers().origin || '*';
      const headers = {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': route.request().headers()['access-control-request-headers'] || 'authorization, content-type',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      streamRequests.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'Content-Type': 'text/event-stream' },
        body: `event: final\ndata: ${JSON.stringify({ text: 'Assistant reply', conversationId: 'assistant-file-e2e' })}\n\n`,
      });
    });
    await signIn(page);
    await page.goto(`/book/${bookId}?chapter=${chapterId}&page=page-001`);
    await expect(page.locator('[data-page-id="page-001"]')).toBeVisible();
    await page.getByRole('button', { name: 'Open writing assistant' }).click();
    const assistant = page.getByRole('complementary', { name: 'Writing assistant' });
    await chooseFileFromMenu(page, 'Attach files', {
      name: 'assistant-source.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 assistant fixture'),
    }, assistant);
    const composer = assistant.getByRole('textbox', { name: 'Message writing assistant' });
    await composer.fill('Keep this source for a future writing session.');
    await assistant.getByRole('button', { name: 'Send message' }).click();

    await expect(assistant.getByText('Assistant reply')).toBeVisible();
    await expect(assistant.getByText(/assistant-source\.pdf/)).toBeVisible();
    await expect(assistant.getByText('Aira has not read these files.')).toBeVisible();
    await expect.poll(() => streamRequests.length).toBe(1);
    await expect.poll(() => api.references.length).toBe(1);
    expect(api.references[0]).toMatchObject({ type: 'conversation', conversationId: 'assistant-file-e2e', bookId, chapterId, pageId: 'page-001' });
  });

  test('page editor files link to the current page and return after reload', async ({ page }) => {
    const api = await setupFileApi(page, { name: 'page-brief.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', documentType: 'DOCX' });
    await signIn(page);
    await page.goto(`/book/${bookId}?chapter=${chapterId}&page=page-001`);
    const editor = page.locator('[data-page-id="page-001"]');
    await expect(editor).toBeVisible();
    await editor.locator('[contenteditable="true"]').last().press('/');
    await page.locator('#bn-suggestion-menu button').filter({ hasText: 'Media' }).click();
    await expect(page.getByText('Page files', { exact: true })).toBeVisible();

    await chooseFileFromMenu(page, 'Attach file', {
      name: 'page-brief.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('DOCX placeholder'),
    });
    await expect(page.getByText('Stored · processing unavailable')).toBeVisible();
    await expect.poll(() => api.references.length).toBe(1);
    expect(api.references[0]).toMatchObject({ type: 'page', bookId, chapterId, pageId: 'page-001' });
    await page.keyboard.press('Escape');
    await expect(editor.getByText(/page-brief\.docx/)).toBeVisible();

    await page.reload();
    const reloadedEditor = page.locator('[data-page-id="page-001"]');
    await expect(reloadedEditor).toBeVisible();
    await expect(reloadedEditor.getByText(/page-brief\.docx/)).toBeVisible();
    await reloadedEditor.getByRole('button', { name: 'Remove page-brief.docx from this page' }).click();
    await expect(reloadedEditor.getByText(/page-brief\.docx/)).toHaveCount(0);
    await page.goto('/files');
    await page.getByRole('tab', { name: 'Books/pages' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'page-brief.docx' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'All' }).click();
    await expect(page.getByRole('row').filter({ hasText: 'page-brief.docx' })).toBeVisible();
  });
});
