import { test, expect } from '@playwright/test';
import { revealPageClipAction } from './helpers/page-actions.mjs';
import { mockPersonalWorkspaceAccess } from './helpers/personal-workspace.mjs';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
// Seeded in Firebase emulator by functions/seed_emulator.mjs + functions/seed_user.mjs
const SEED_BOOK_ID = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';

const login = async (page) => {
  await mockPersonalWorkspaceAccess(page);
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
};

const openBookAndGetGenerateBtn = async (page) => {
  await page.goto(`/book/${SEED_BOOK_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('view-pages-btn').click();
  return revealPageClipAction(page);
};

const clickGenerateBtn = async (_page, button) => button.click();

test.describe('Manim video dialog', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run these tests.');
    await login(page);
  });

  test('Generate Clip button opens the Manim video dialog', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
  });

  test('dialog has instruction textarea and quality selector', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-instruction')).toBeVisible();
    await expect(page.getByTestId('manim-video-quality-selector')).toBeVisible();
    await expect(page.getByTestId('manim-quality-low')).toBeVisible();
    await expect(page.getByTestId('manim-quality-medium')).toBeVisible();
    await expect(page.getByTestId('manim-quality-high')).toBeVisible();
  });

  test('Cancel closes the dialog without navigating', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('manim-video-cancel').click();
    await expect(page.getByTestId('manim-video-dialog')).not.toBeVisible();
    await expect(page).not.toHaveURL(/\/movies/);
  });

  test('quality selection highlights the chosen option', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('manim-quality-medium').click();
    await expect(page.getByTestId('manim-quality-medium')).toHaveClass(/manim-quality-option-selected/);
    await expect(page.getByTestId('manim-quality-low')).not.toHaveClass(/manim-quality-option-selected/);
  });
});
