/**
 * Critical product path for the isolated Firebase emulator profile.
 *
 * login -> dashboard -> Books -> seeded book -> chapter -> Add Page Manually
 * -> editor Save (createPage) -> rename page (page + pagesSummary update).
 *
 * Run through scripts/run-airabook-qa.mjs so the emulator account and seed are
 * deterministic and the suite never writes to airabook-dev.
 */

import { test, expect } from '@playwright/test';
import { mockPersonalWorkspaceAccess } from './helpers/personal-workspace.mjs';
import { getEmulatorDocument, setEmulatorStringField } from './helpers/firestore-emulator.mjs';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
const bookId = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';

test.describe('Airabook critical path', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(process.env.PLAYWRIGHT_USE_EMULATOR !== 'true', 'Critical-path writes are restricted to the local Firebase emulator.');
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run critical-path tests.');

    await mockPersonalWorkspaceAccess(page);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[name="email"]').fill(email);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
  });

  test('logs in, opens the seeded book, creates a page, and persists a page update', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Books', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Books', exact: true }).click();
    await page.waitForURL('**/books', { timeout: 10_000 });

    const bookLink = page.locator(`a[href="/book/${bookId}/view"]`).first();
    await expect(bookLink).toBeVisible({ timeout: 10_000 });
    await bookLink.click();
    await page.waitForURL(`**/book/${bookId}/view`, { timeout: 10_000 });

    // The library's Open Book action is intentionally read-only. Continue to
    // the edit route to exercise page creation and updates.
    await page.goto(`/book/${bookId}`, { waitUntil: 'domcontentloaded' });

    const chapterRow = page.locator('.chapter-sidebar-row').first();
    await expect(chapterRow).toBeVisible({ timeout: 10_000 });
    await chapterRow.click();
    const chapterId = new URL(page.url()).searchParams.get('chapter');
    expect(chapterId).toBeTruthy();

    const addPageButton = page.getByTestId('add-page-btn');
    await expect(addPageButton).toBeVisible({ timeout: 10_000 });
    await addPageButton.click();

    const draftPage = page.locator('[data-page-id^="temp_"]').last();
    await expect(draftPage).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.editor-save-btn').last()).toBeVisible();

    // The empty BlockNote document still has an editable block. Add content so
    // the createPage payload and the sidebar summary have meaningful data.
    const editor = page.locator('[contenteditable="true"]').last();
    await editor.click();
    const savedText = `Critical path page ${Date.now()}`;
    await editor.fill(savedText);
    await page.locator('.editor-save-btn').last().click();

    await expect(page.locator('[data-page-id^="temp_"]')).toHaveCount(0, { timeout: 15_000 });
    const savedPage = page.locator('[data-page-id]').filter({ hasText: savedText }).first();
    await expect(savedPage).toBeVisible();
    const pageId = await savedPage.getAttribute('data-page-id');
    expect(pageId).toBeTruthy();

    const updatedPageName = `Updated E2E page ${Date.now()}`;
    const pageRow = page.locator('.chapter-page-row').last();
    await expect(pageRow).toBeVisible({ timeout: 10_000 });
    await pageRow.dblclick();
    const pageNameInput = page.locator('input[placeholder="Page name"]');
    await expect(pageNameInput).toBeVisible();
    await pageNameInput.fill(updatedPageName);
    await pageNameInput.press('Enter');

    await expect(page.locator('.chapter-page-row').filter({ hasText: updatedPageName })).toBeVisible({ timeout: 10_000 });

    // Verify a fresh Firestore read, not only React local state.
    await page.goto(`/book/${bookId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chapter-sidebar-row').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('.chapter-sidebar-row').first().click();
    await expect(page.locator('.chapter-page-row').filter({ hasText: updatedPageName })).toBeVisible({ timeout: 10_000 });

    const persistedPage = await getEmulatorDocument(`books/${bookId}/chapters/${chapterId}/pages/${pageId}`);
    expect(persistedPage).toMatchObject({ pageName: updatedPageName });
    expect(persistedPage.note).toContain(savedText);
    expect(persistedPage.plainText).toContain(savedText);

    const persistedChapter = await getEmulatorDocument(`books/${bookId}/chapters/${chapterId}`);
    expect(persistedChapter.pagesSummary).toEqual(expect.arrayContaining([
      expect.objectContaining({ pageId, pageName: updatedPageName }),
    ]));

    const visibleSummary = 'The saved pages describe the family preparing for a new beginning.';
    await setEmulatorStringField(`books/${bookId}/chapters/${chapterId}`, 'chapterSummary', visibleSummary);
    await expect(page.getByTestId('chapter-summary')).toContainText(visibleSummary);
  });
});
