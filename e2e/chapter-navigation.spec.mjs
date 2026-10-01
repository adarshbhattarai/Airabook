import { test, expect } from '@playwright/test';

test('chapter navigation keeps the selected chapter and its pages in sync', async ({ browser }) => {
  test.skip(
    process.env.PLAYWRIGHT_USE_EMULATOR !== 'true',
    'This journey creates an account and book, so it only runs against the local Firebase emulators.',
  );
  test.setTimeout(180_000);

  const email = `chapter-navigation-${Date.now()}@playwright.dev`;
  const password = 'Playwright@Test1!';
  const chapterTitles = ['Navigation Alpha', 'Navigation Beta', 'Navigation Gamma'];
  const chapterIds = [];
  const pageContents = chapterTitles.map((title) => [
    `${title} first page content for the navigation regression`,
    `${title} second page content for the navigation regression`,
  ]);

  const signupPage = await browser.newPage();
  await signupPage.goto('/signup');
  await signupPage.locator('input[name="name"]').fill('Chapter Navigation Tester');
  await signupPage.locator('input[name="email"]').fill(email);
  await signupPage.locator('input[name="password"]').fill(password);
  await signupPage.getByRole('button', { name: 'Create Account' }).click();
  await signupPage.waitForURL('**/dashboard');
  await signupPage.close();

  const page = await browser.newPage();
  try {
    await page.goto('/login');
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard');

    await page.getByRole('link', { name: 'Books', exact: true }).click();
    await page.waitForURL('**/create-book');
    await page.getByRole('button', { name: 'Start Blank' }).click();
    await page.locator('#book-title').fill(`Chapter Navigation ${Date.now()}`);
    await page.getByTestId('create-book-submit').click();
    await page.waitForURL(/\/book\/[^/?]+$/);
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

    // A fresh load must resolve the final chapter/page deep link from Firestore.
    await page.goto(`${bookUrl.pathname}${new URL(page.url()).search}`);
    await expect(page.locator('[data-page-id]').filter({ hasText: pageContents[0][1] })).toHaveCount(1);
    await expect.poll(() => new URL(page.url()).searchParams.get('chapter')).toBe(chapterIds[0]);
  } finally {
    await page.close();
  }
});
