import { test, expect } from '@playwright/test';
import { mockPersonalWorkspaceAccess } from './helpers/personal-workspace.mjs';
import { mockFirebaseCallable } from './helpers/mock-firebase-callable.mjs';

test('writing assistant follows the editor, pins book/chapter/page context, and sends the current draft', async ({ page }) => {
  test.skip(process.env.PLAYWRIGHT_USE_EMULATOR !== 'true', 'Writing context uses only isolated emulator data.');
  test.setTimeout(90_000);
  const bookId = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';
  const chapterId = process.env.PLAYWRIGHT_CHAPTER_ID || 'chapter-001';
  const requests = [];
  const ideasRequests = [];
  await page.setViewportSize({ width: 1520, height: 1000 });
  await mockPersonalWorkspaceAccess(page);
  await mockFirebaseCallable(page, 'generateChapterSuggestions', async (route) => {
    ideasRequests.push(route.request().postDataJSON().data);
    return { data: { suggestions: ['Describe the valley at sunrise.'] } };
  });
  await page.route('**/api/v1/chat/stream', async (route) => {
    const origin = route.request().headers().origin || '*';
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': route.request().headers()['access-control-request-headers'] || 'authorization, content-type',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    requests.push(route.request().postDataJSON());
    const text = '## Writing notes\n\nKeep the **valley scene** focused.\n\n- Add one clear detail.';
    await route.fulfill({ status: 200, headers: { ...headers, 'Content-Type': 'text/event-stream' }, body: `event: final\ndata: ${JSON.stringify({ text, conversationId: 'context-regression' })}\n\n` });
  });
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(process.env.PLAYWRIGHT_EMAIL);
  await page.locator('input[name="password"]').fill(process.env.PLAYWRIGHT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.goto(`/book/${bookId}?chapter=${chapterId}&page=page-001`);
  const entry = page.locator('[data-page-id="page-001"]');
  await expect(entry).toBeVisible();
  await entry.getByRole('textbox', { name: 'Page name' }).fill('Valley observations');
  const draft = `Unpublished valley observation ${Date.now()}. The sun touched the river.`;
  await entry.locator('[contenteditable="true"]').last().fill(draft);
  await expect(entry.getByTestId('writing-save-status')).toContainText('Unsaved');
  await page.getByRole('button', { name: 'Open writing assistant' }).click();
  const assistant = page.getByRole('complementary', { name: 'Writing assistant' });
  const picker = assistant.getByTestId('assistant-context-picker');
  const composer = assistant.getByRole('textbox', { name: 'Message writing assistant' });
  const send = async (message) => {
    const before = requests.length;
    await composer.fill(message);
    await assistant.getByRole('button', { name: 'Send message' }).click();
    await expect.poll(() => requests.length).toBe(before + 1);
    await expect(assistant.getByRole('heading', { name: 'Writing notes' }).last()).toBeVisible();
    await expect(composer).toBeEnabled();
    return requests.at(-1);
  };
  await expect(picker).toContainText('Page · Valley observations');
  let request = await send('Help me review this passage.');
  expect(request.contextType).toBe('ASSISTANT');
  expect(request.metadata).toMatchObject({ bookId, chapterId, pageId: 'page-001', contextScope: 'page' });
  expect(request.uiContext.page).toMatchObject({ id: 'page-001', title: 'Valley observations', text: expect.stringContaining(draft), isDraft: true });
  await expect(assistant.locator('strong').last()).toHaveText('valley scene');

  await picker.click();
  await page.getByRole('menuitem', { name: 'Entire book', exact: true }).click();
  await expect(assistant.getByTestId('assistant-context-mode')).toHaveText('Pinned');
  request = await send('What themes connect the book?');
  expect(request.uiContext.scope).toBe('book');
  expect(request.uiContext.book.id).toBe(bookId);
  expect(request.metadata.chapterId).toBeUndefined();
  expect(request.metadata.pageId).toBeUndefined();
  expect(request.uiContext.chapter).toBeUndefined();
  expect(request.uiContext.page).toBeUndefined();

  await picker.click();
  await page.getByRole('menuitem', { name: 'Choose chapter', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Use chapter Chapter 1', exact: true }).click();
  request = await send('Help me understand this chapter.');
  expect(request.metadata).toMatchObject({ bookId, chapterId, contextScope: 'chapter' });
  expect(request.uiContext.scope).toBe('chapter');
  expect(request.uiContext.page).toBeUndefined();
  await entry.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(entry.getByTestId('writing-save-status')).toContainText('Saved');
  await page.screenshot({ path: test.info().outputPath('assistant-light.png'), animations: 'disabled' });

  const otherChapter = `Context chapter ${Date.now()}`;
  const chapterInput = page.getByPlaceholder('New chapter...');
  await chapterInput.fill(otherChapter);
  await chapterInput.press('Enter');
  await page.locator('.chapter-sidebar-row').filter({ hasText: otherChapter }).click();
  await expect(page.getByRole('heading', { name: otherChapter, exact: true })).toBeVisible();
  await expect(picker).toContainText('Chapter · Chapter 1');
  await assistant.getByRole('tab', { name: 'Chapter ideas' }).click();
  await expect(assistant.getByTestId('chapter-suggestion-item')).toHaveText('Describe the valley at sunrise.');
  expect(ideasRequests.at(-1).chapterId).toBe(chapterId);
  const beforeIdea = requests.length;
  await assistant.getByTestId('chapter-suggestion-item').click();
  await expect(composer).toHaveValue('Describe the valley at sunrise.');
  expect(requests).toHaveLength(beforeIdea);

  await picker.click();
  await page.getByRole('menuitem', { name: 'Choose page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Pages in Chapter 1', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Use page Valley observations', exact: true }).click();
  request = await send('Revisit the page we just wrote.');
  expect(request.metadata.pageId).toBe('page-001');
  expect(request.metadata.chapterId).toBe(chapterId);
  expect(request.uiContext.page.text).toContain(draft);
  expect(request.uiContext.page.isDraft).toBe(false);

  await picker.click();
  await page.getByRole('menuitem', { name: 'Follow editor', exact: true }).click();
  await expect(picker).toContainText(otherChapter);
  await expect(assistant.getByTestId('assistant-context-mode')).toHaveText('Following editor');
  await picker.click();
  await page.keyboard.press('Escape');
  await expect(assistant).toBeVisible();
  await expect(picker).toBeFocused();
  for (const theme of ['dark', 'matrix']) {
    await page.evaluate((value) => { document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-matrix'); document.documentElement.classList.add(`theme-${value}`); }, theme);
    await page.screenshot({ path: test.info().outputPath(`assistant-${theme}.png`), animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(assistant).toBeVisible();
  const bounds = await assistant.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(assistant.getByRole('button', { name: 'Close writing assistant' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('assistant-mobile.png'), animations: 'disabled' });
});
