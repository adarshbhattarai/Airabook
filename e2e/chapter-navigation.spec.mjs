import { test, expect } from '@playwright/test';
import { mockPersonalWorkspaceAccess } from './helpers/personal-workspace.mjs';
import { setEmulatorStringField } from './helpers/firestore-emulator.mjs';
import { mockFirebaseCallable } from './helpers/mock-firebase-callable.mjs';

test('chapter navigation keeps the selected chapter and its pages in sync', async ({ browser }) => {
  const email = process.env.PLAYWRIGHT_EMAIL || '';
  const password = process.env.PLAYWRIGHT_PASSWORD || '';
  test.skip(
    process.env.PLAYWRIGHT_USE_EMULATOR !== 'true',
    'This journey creates a book, so it only runs against the local Firebase emulators.',
  );
  test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to use the seeded emulator account.');
  test.setTimeout(180_000);

  const bookId = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';
  const runId = Date.now();
  const chapterTitles = ['Navigation Alpha', 'Navigation Beta', 'Navigation Gamma'].map((title) => `${title} ${runId}`);
  const chapterIds = [];
  const pageContents = chapterTitles.map((title) => [
    `${title} first page content for the navigation regression`,
    `${title} second page content for the navigation regression`,
  ]);

  const page = await browser.newPage();
  try {
    await mockPersonalWorkspaceAccess(page);
    const suggestionRequests = [];
    await mockFirebaseCallable(page, 'generateChapterSuggestions', async (route) => {
      const requestBody = route.request().postDataJSON() || {};
      const callableData = requestBody.data || requestBody;
      suggestionRequests.push(callableData);
      return {
        data: {
          suggestions: callableData.refresh
            ? ['Build on the new family chapter summary.']
            : ['Write about a memorable journey.'],
        },
      };
    });
    await page.route('**/api/v1/chat/stream', async (route) => {
      const origin = route.request().headers().origin || '*';
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': route.request().headers()['access-control-request-headers'] || 'authorization, content-type',
          },
        });
        return;
      }
      await route.fulfill({
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Content-Type': 'text/event-stream',
      },
      body: 'event: token\ndata: {"text":"Let’s shape that journey into a chapter."}\n\nevent: final\ndata: {"text":"Let’s shape that journey into a chapter.","conversationId":"writing-test"}\n\n',
      });
    });
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');

    await page.goto(`/book/${bookId}`);
    await expect(page.locator('.chapter-sidebar-row').first()).toBeVisible();
    const bookUrl = new URL(page.url());

    for (const [chapterIndex, title] of chapterTitles.entries()) {
      const chapterInput = page.getByPlaceholder('New chapter...');
      await chapterInput.fill(title);
      await chapterInput.press('Enter');

      const chapterRow = page.locator('.chapter-sidebar-row').filter({ hasText: title });
      await expect(chapterRow).toBeVisible();
      await chapterRow.click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      const chapterId = new URL(page.url()).searchParams.get('chapter');
      expect(chapterId).toBeTruthy();
      chapterIds.push(chapterId);
      if (chapterIndex === 0) {
        await expect(page.getByRole('button', { name: /Plan media/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /Transfer/i })).toHaveCount(0);
        await expect(page.getByRole('complementary', { name: 'Writing assistant' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Open writing assistant' }).click();
        const assistant = page.getByRole('complementary', { name: 'Writing assistant' });
        await expect(assistant.getByRole('heading', { name: 'Writing assistant' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'AI Assistant', exact: true })).toHaveCount(0);
        await assistant.getByRole('tab', { name: 'Chapter ideas' }).click();
        await expect(assistant.getByTestId('chapter-suggestion-item').first()).toHaveText('Write about a memorable journey.');
        expect(suggestionRequests).toHaveLength(1);

        const chapterSummary = 'The family welcomed the baby and celebrated the first days together.';
        await setEmulatorStringField(`books/${bookId}/chapters/${chapterId}`, 'chapterSummary', chapterSummary);
        await expect(page.getByTestId('chapter-summary')).toContainText(chapterSummary);
        // Summary changes keep existing ideas in place until the user refreshes.
        await expect(assistant.getByTestId('chapter-suggestion-item').first()).toHaveText('Write about a memorable journey.');
        expect(suggestionRequests).toHaveLength(1);

        await assistant.getByRole('button', { name: 'Refresh chapter suggestions' }).click();
        await expect(assistant.getByTestId('chapter-suggestion-item').first()).toHaveText('Build on the new family chapter summary.');
        expect(suggestionRequests).toHaveLength(2);
        expect(suggestionRequests[1]).toMatchObject({ bookId, chapterId, refresh: true });
        await assistant.getByTestId('chapter-suggestion-item').first().click();
        const composer = assistant.getByRole('textbox', { name: 'Message writing assistant' });
        await expect(composer).toHaveValue('Build on the new family chapter summary.');
        const requestPromise = page.waitForRequest('**/api/v1/chat/stream');
        await assistant.getByRole('button', { name: 'Send message' }).click();
        const body = (await requestPromise).postDataJSON();
        expect(body.contextType).toBe('ASSISTANT');
        expect(body.metadata.chapterId).toBe(new URL(page.url()).searchParams.get('chapter'));
        expect(body.uiContext.chapter.summary).toBe(chapterSummary);
        await expect(assistant.getByText('Let’s shape that journey into a chapter.')).toBeVisible();
        await page.screenshot({ path: test.info().outputPath('writing-assistant.png'), animations: 'disabled' });
        await composer.press('Escape');
        await expect(assistant).toHaveCount(0);
        await page.getByRole('button', { name: 'Open writing assistant' }).click();
        await expect(assistant.getByText('Let’s shape that journey into a chapter.')).toBeVisible();
        await assistant.getByRole('button', { name: 'Close writing assistant' }).click();
      }
      for (const [pageIndex, content] of pageContents[chapterIndex].entries()) {
        if (pageIndex > 0) {
          await chapterRow.click();
          await expect(page.getByTestId('add-page-btn')).toBeVisible();
        }
        await page.getByTestId('add-page-btn').click();

        const draftPage = page.locator('[data-page-id^="temp_"]').last();
        await expect(draftPage).toBeVisible();
        await draftPage.locator('[contenteditable="true"]').last().fill(content);
        await draftPage.locator('.editor-save-btn').last().click();
        await expect(draftPage).toHaveCount(0);

        const chapterGroup = chapterRow.locator('..');
        await expect(chapterGroup.locator('.chapter-page-row')).toHaveCount(pageIndex + 1);
      }
    }

    // Revisit chapters in a fixed mixed order so the test is repeatable while
    // exercising switches away from a URL that still names another chapter's page.
    for (const chapterIndex of [2, 0, 1, 2, 1, 0]) {
      const title = chapterTitles[chapterIndex];
      const chapterRow = page.locator('.chapter-sidebar-row').filter({ hasText: title });
      await chapterRow.click();

      await expect.poll(() => new URL(page.url()).searchParams.get('chapter')).toBe(chapterIds[chapterIndex]);
      expect(new URL(page.url()).searchParams.has('page')).toBe(false);
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      await expect(page.getByTestId('view-pages-btn')).toContainText('View Pages (2)');
      await page.getByTestId('view-pages-btn').click();

      for (const content of pageContents[chapterIndex]) {
        await expect(page.locator('[data-page-id]').filter({ hasText: content })).toHaveCount(1);
      }
      for (const [otherIndex, otherContents] of pageContents.entries()) {
        if (otherIndex === chapterIndex) continue;
        for (const content of otherContents) {
          await expect(page.locator('[data-page-id]').filter({ hasText: content })).toHaveCount(0);
        }
      }

      await chapterRow.locator('..').locator('.chapter-page-row').last().click();
      await expect.poll(() => new URL(page.url()).searchParams.get('page')).not.toBeNull();
    }

    // A long journal entry remains on its own page while the viewport changes,
    // the user scrolls, and other entries are edited without changing the URL.
    const alphaRow = page.locator('.chapter-sidebar-row').filter({ hasText: chapterTitles[0] });
    const alphaPages = alphaRow.locator('..').locator('.chapter-page-row');
    const firstId = await page.locator('[data-page-id]').first().getAttribute('data-page-id');
    const secondId = await page.locator('[data-page-id]').nth(1).getAttribute('data-page-id');
    const firstEntry = page.locator(`[data-page-id="${firstId}"]`);
    const secondEntry = page.locator(`[data-page-id="${secondId}"]`);
    const firstPageTitle = firstEntry.getByRole('textbox', { name: 'Page name' });
    await firstPageTitle.fill('Field Notes — Day One');
    await expect(firstEntry.getByTestId('writing-save-status')).toContainText('Unsaved');
    await expect(alphaPages.first()).toContainText('Field Notes — Day One');
    await firstEntry.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(firstEntry.getByTestId('writing-save-status')).toContainText('Saved');

    const longText = [...Array.from({ length: 180 }, (_, index) =>
      `Journal observation ${index}: we explored the valley, recorded the weather and kept our itinerary notes together.`,
    ), 'END OF FIRST JOURNAL ENTRY'].join('\n');

    const appendEntryText = async (entry, text) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.evaluate((value) => navigator.clipboard.writeText(value), text);
      const editor = entry.locator('.bn-editor');
      const before = (await editor.innerText()).replace(/\s+/g, ' ').trim();
      const lastParagraph = editor.locator('.bn-inline-content').last();
      const bounds = await lastParagraph.boundingBox();
      await lastParagraph.click({ position: { x: Math.max(1, bounds.width - 2), y: Math.max(1, bounds.height - 2) } });
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.press('ControlOrMeta+V');
      const expected = `${before} ${text}`.replace(/\s+/g, ' ').trim();
      await expect.poll(async () => (await editor.innerText()).replace(/\s+/g, ' ').trim() === expected).toBe(true);
      return expected;
    };
    await alphaPages.first().click();
    await appendEntryText(firstEntry, longText);
    await expect(firstEntry.getByTestId('writing-length-hint')).toBeVisible();
    await expect(firstEntry.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 1100, height: 760 });
    await expect.poll(() => page.getByTestId('book-pages-scroll').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect.poll(() => page.locator('[data-page-id]').evaluateAll((elements) => elements[1].getBoundingClientRect().top >= elements[0].getBoundingClientRect().bottom)).toBe(true);

    await alphaPages.last().click(); // Saves the long draft through the actual callable.
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(secondId);
    await expect(secondEntry.locator('.bn-editor')).toContainText(pageContents[0][1]);
    await expect(secondEntry.locator('.bn-editor')).not.toContainText('END OF FIRST JOURNAL ENTRY');
    const expectedSecondText = await appendEntryText(secondEntry, 'Second entry independent draft.');
    // Editing the first page by scrolling/focus must not overwrite the selected second page.
    const expectedFirstText = await appendEntryText(firstEntry, 'First entry additional draft.');
    await expect(alphaPages.first()).toHaveClass(/chapter-page-row-active/);
    expect(new URL(page.url()).searchParams.get('page')).toBe(secondId);

    await page.locator('.chapter-sidebar-row').filter({ hasText: chapterTitles[1] }).click();
    await expect(page.getByRole('heading', { name: chapterTitles[1], exact: true })).toBeVisible();
    await alphaRow.click();
    await page.getByTestId('view-pages-btn').click();
    await expect.poll(async () => (await firstEntry.locator('.bn-editor').innerText()).replace(/\s+/g, ' ').trim()).toBe(expectedFirstText);
    await expect.poll(async () => (await secondEntry.locator('.bn-editor').innerText()).replace(/\s+/g, ' ').trim()).toBe(expectedSecondText);
    await expect(secondEntry.locator('.bn-editor')).not.toContainText('END OF FIRST JOURNAL ENTRY');
    await expect(page.locator('[data-page-id]')).toHaveCount(2);

    // The length guide is optional, shared by the book's entries, and remembered.
    await firstEntry.getByRole('button', { name: 'More page options' }).click();
    await page.getByRole('menuitem', { name: 'Length guide', exact: true }).hover();
    await page.getByRole('menuitemradio', { name: 'Off', exact: true }).click();
    await expect(firstEntry.getByTestId('writing-length-hint')).toHaveCount(0);
    await expect(firstEntry.getByTestId('writing-page-stats')).not.toContainText('suggested');
    await expect(secondEntry.getByTestId('writing-page-stats')).not.toContainText('suggested');
    await firstEntry.getByRole('button', { name: 'More page options' }).click();
    await page.getByRole('menuitem', { name: 'Rewrite page', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Refine your writing' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await alphaPages.last().click();

    // A fresh load must resolve the final chapter/page deep link from Firestore.
    await page.goto(`${bookUrl.pathname}${new URL(page.url()).search}`);
    await expect(page.locator('[data-page-id]').filter({ hasText: pageContents[0][1] })).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('chapter')).toBe(chapterIds[0]);
    await expect.poll(async () => (await firstEntry.locator('.bn-editor').innerText()).replace(/\s+/g, ' ').trim()).toBe(expectedFirstText);
    await expect.poll(async () => (await secondEntry.locator('.bn-editor').innerText()).replace(/\s+/g, ' ').trim()).toBe(expectedSecondText);
    await expect(firstEntry.getByTestId('writing-length-hint')).toHaveCount(0);
    await expect(firstEntry.getByTestId('writing-page-stats')).not.toContainText('suggested');
    await expect(firstEntry.getByRole('textbox', { name: 'Page name' })).toHaveValue('Field Notes — Day One');
    await expect(alphaPages.first()).toContainText('Field Notes — Day One');
    await alphaPages.first().click();
    await page.setViewportSize({ width: 1600, height: 1000 });
    await firstEntry.getByRole('textbox', { name: 'Page name' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('journal-light.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Light mode', exact: true }).click();
    await page.getByRole('menuitemradio', { name: /Matrix/ }).click();
    await expect(page.locator('html')).toHaveClass(/theme-matrix/);
    await page.screenshot({ path: test.info().outputPath('journal-matrix.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Open writing assistant' }).click();
    await page.screenshot({ path: test.info().outputPath('writing-assistant-matrix.png'), animations: 'disabled' });
    await page.setViewportSize({ width: 800, height: 800 });
    await expect(page.getByRole('textbox', { name: 'Message writing assistant' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('writing-assistant-narrow.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', { name: 'Writing assistant' })).toHaveCount(0);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await firstEntry.getByRole('button', { name: 'More page options' }).click();
    await page.getByRole('menuitem', { name: 'Rewrite page', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Refine your writing' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('journal-ai-writing.png'), animations: 'disabled' });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: `Continue to ${chapterTitles[1]}`, exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('chapter')).toBe(chapterIds[1]);
    await expect(page.locator('[data-page-id]')).toHaveCount(2);
    await expect(page.locator('[data-page-id]').first().locator('.bn-editor')).toContainText(pageContents[1][0]);
    const betaIds = await page.locator('[data-page-id]').evaluateAll((elements) => elements.map((element) => element.dataset.pageId));
    await expect.poll(() => new URL(page.url()).searchParams.get('page')).toBe(betaIds[0]);
    // A toolbar-created entry belongs after its source page, preserving both neighbors.
    await page.locator('[data-page-id]').first().getByRole('button', { name: 'New page', exact: true }).click();
    await expect(page.locator('[data-page-id]')).toHaveCount(3);
    await expect(page.locator('[data-page-id]').first()).toHaveAttribute('data-page-id', betaIds[0]);
    await expect(page.locator('[data-page-id]').last()).toHaveAttribute('data-page-id', betaIds[1]);
    await expect(page.locator('[data-page-id]').last().locator('.bn-editor')).toContainText(pageContents[1][1]);
  } catch (error) {
    await page.screenshot({ path: test.info().outputPath('journal-failure.png') });
    throw error;
  } finally {
    await page.close();
  }
});
