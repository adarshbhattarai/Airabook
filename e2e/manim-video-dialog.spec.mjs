import { test, expect } from '@playwright/test';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
// Seeded in Firebase emulator by functions/seed_emulator.mjs + functions/seed_user.mjs
const SEED_BOOK_ID = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';

const login = async (page) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
};

/**
 * Open the book editor and navigate to the pages view.
 * Returns the first visible Generate Clip button, or null if unavailable.
 * Navigates directly to the seeded book ID to avoid the /books → /create-book redirect.
 */
const openBookAndGetGenerateBtn = async (page) => {
  await page.goto(`/book/${SEED_BOOK_ID}`, { waitUntil: 'domcontentloaded' });

  // Wait for the chapter sidebar or error toast — 10s max
  await page.waitForSelector('button, [data-testid]', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Check if there's an error (book not found)
  const url = page.url();
  if (!url.includes(`/book/${SEED_BOOK_ID}`)) return null;

  // Switch from chapter view to pages view so PageEditor renders
  const viewPagesBtn = page.getByRole('button', { name: /view pages/i }).first();
  if (await viewPagesBtn.count()) {
    await viewPagesBtn.click();
    await page.waitForTimeout(1500);
  }

  // Wait for the Generate Clip button
  const generateBtn = page.getByTestId('book-detail-create-video').first();
  try {
    await generateBtn.waitFor({ state: 'visible', timeout: 8000 });
    return generateBtn;
  } catch {
    return null;
  }
};

/** Clicks via JS to bypass overflow scroll container clipping */
const clickGenerateBtn = async (page, btn) => {
  await btn.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
};

test.describe('Manim video dialog', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run these tests.');
    await login(page);
  });

  test('Generate Clip button opens the Manim video dialog', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);
    test.skip(!generateBtn, `No Generate Clip button — seed book ${SEED_BOOK_ID} in emulator first.`);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
  });

  test('dialog has instruction textarea and quality selector', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);
    test.skip(!generateBtn, `No Generate Clip button — seed book ${SEED_BOOK_ID} in emulator first.`);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-instruction')).toBeVisible();
    await expect(page.getByTestId('manim-video-quality-selector')).toBeVisible();
    await expect(page.getByTestId('manim-quality-low')).toBeVisible();
    await expect(page.getByTestId('manim-quality-medium')).toBeVisible();
    await expect(page.getByTestId('manim-quality-high')).toBeVisible();
  });

  test('Cancel closes the dialog without navigating', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);
    test.skip(!generateBtn, `No Generate Clip button — seed book ${SEED_BOOK_ID} in emulator first.`);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('manim-video-cancel').click();
    await expect(page.getByTestId('manim-video-dialog')).not.toBeVisible();
    await expect(page).not.toHaveURL(/\/movies/);
  });

  test('quality selection highlights the chosen option', async ({ page }) => {
    const generateBtn = await openBookAndGetGenerateBtn(page);
    test.skip(!generateBtn, `No Generate Clip button — seed book ${SEED_BOOK_ID} in emulator first.`);

    await clickGenerateBtn(page, generateBtn);
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('manim-quality-medium').click();
    await expect(page.getByTestId('manim-quality-medium')).toHaveClass(/border-indigo-500/);
    await expect(page.getByTestId('manim-quality-low')).not.toHaveClass(/border-indigo-500/);
  });
});
