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

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
const bookId = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';

test.describe('Airabook critical path', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run critical-path tests.');

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
    await editor.fill(`Critical path page ${Date.now()}`);
    await page.locator('.editor-save-btn').last().click();

    await expect(page.locator('[data-page-id^="temp_"]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-page-id]').last()).toBeVisible();

    const updatedPageName = `Updated E2E page ${Date.now()}`;
    const pageRow = page.locator('.chapter-page-row').last();
    await expect(pageRow).toBeVisible({ timeout: 10_000 });
    await pageRow.dblclick();
    const pageNameInput = page.locator('input[placeholder="Page name"]');
    await expect(pageNameInput).toBeVisible();
    await pageNameInput.fill(updatedPageName);
    await pageNameInput.press('Enter');

    await expect(page.getByText(updatedPageName, { exact: true })).toBeVisible({ timeout: 10_000 });

    // Verify a fresh Firestore read, not only React local state.
    await page.goto(`/book/${bookId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.chapter-sidebar-row').first()).toBeVisible({ timeout: 10_000 });
    await page.locator('.chapter-sidebar-row').first().click();
    await expect(page.getByText(updatedPageName, { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
