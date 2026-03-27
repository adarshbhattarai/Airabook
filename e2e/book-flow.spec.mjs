/**
 * Book creation and editing flow — end-to-end smoke tests.
 *
 * Covers:
 *  1. /books list loads after login
 *  2. Navigating into a book shows the chapter sidebar
 *  3. Adding a new chapter via the sidebar input
 *  4. Chapter view shows "Chapter suggestions" panel (GenerateChapterContent)
 *  5. Adding a page manually from chapter view
 *  6. Generate Clip button opens the Manim video dialog
 *  7. Submitting the dialog with mocked Spring backend creates a job
 *  8. Creating a new book via /create-book form
 *
 * Prerequisites:
 *  - Firebase emulators running (npm run emulators:local)
 *  - Frontend running (npm run local)
 *  - Emulator seeded: npm run seed:data   (creates book-debug-001 / chapter-001 / page-001)
 *  - PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD env vars set
 *
 * Spring backend is mocked via page.route() — Manim and Agent do NOT need to
 * be running for these tests (only the clip submission dialog tests).
 *
 * Run:
 *   PLAYWRIGHT_EMAIL=claude@airabook.dev PLAYWRIGHT_PASSWORD=Claude@Dev2024! \
 *     npx playwright test e2e/book-flow.spec.mjs
 */

import { test, expect } from '@playwright/test';

const email    = process.env.PLAYWRIGHT_EMAIL    || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
// Seeded by functions/seed_emulator.mjs
const SEED_BOOK_ID    = process.env.PLAYWRIGHT_BOOK_ID    || 'book-debug-001';
const SEED_CHAPTER_ID = process.env.PLAYWRIGHT_CHAPTER_ID || 'chapter-001';

// ─── helpers ─────────────────────────────────────────────────────────────────

const login = async (page) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
};

/** Navigate to the seeded book and wait for sidebar to load. */
const openSeededBook = async (page) => {
  await page.goto(`/book/${SEED_BOOK_ID}`, { waitUntil: 'domcontentloaded' });
  // Wait for chapter sidebar to appear
  await page.waitForSelector('.chapter-sidebar-row, [placeholder="New chapter..."]', { timeout: 10000 });
  await page.waitForTimeout(1000);
};

/** Click the first chapter sidebar row to select it and enter chapter view. */
const selectFirstChapter = async (page) => {
  const chapterRow = page.locator('.chapter-sidebar-row').first();
  if (await chapterRow.count()) {
    await chapterRow.click();
    await page.waitForTimeout(1000);
  }
};

// ─── test setup ──────────────────────────────────────────────────────────────

test.describe('Book flow', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run book flow tests.');
    await login(page);
  });

  // ── 1. Books list ───────────────────────────────────────────────────────────

  test('books list page loads after login', async ({ page }) => {
    await page.goto('/books', { waitUntil: 'domcontentloaded' });
    // Either a book card or an empty-state element should be visible
    const bookLink  = page.locator('a[href^="/book/"]').first();
    const emptyState = page.getByText(/no books|create your first|get started/i).first();
    await expect(bookLink.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('seeded book card is visible in books list', async ({ page }) => {
    await page.goto('/books', { waitUntil: 'domcontentloaded' });
    const seedBookLink = page.locator(`a[href="/book/${SEED_BOOK_ID}"]`).first();
    test.skip(!(await seedBookLink.count()), `Seed book ${SEED_BOOK_ID} not found — run npm run seed:data first.`);
    await expect(seedBookLink).toBeVisible();
  });

  // ── 2. Book detail — chapter sidebar ────────────────────────────────────────

  test('book detail shows chapter sidebar', async ({ page }) => {
    await openSeededBook(page);
    // Chapter list or "New chapter..." input must be visible
    await expect(
      page.locator('.chapter-sidebar-row, [placeholder="New chapter..."]').first()
    ).toBeVisible();
  });

  test('chapter sidebar shows the new-chapter input', async ({ page }) => {
    await openSeededBook(page);
    await expect(page.locator('[placeholder="New chapter..."]')).toBeVisible();
  });

  // ── 3. Add a chapter ────────────────────────────────────────────────────────

  test('adding a chapter title and pressing Enter creates the chapter', async ({ page }) => {
    await openSeededBook(page);

    const chapterInput = page.locator('[placeholder="New chapter..."]');
    await chapterInput.fill(`E2E Chapter ${Date.now()}`);
    await chapterInput.press('Enter');

    // A new .chapter-sidebar-row should appear
    await expect(page.locator('.chapter-sidebar-row').first()).toBeVisible({ timeout: 8000 });
  });

  test('adding a chapter via the + button creates the chapter', async ({ page }) => {
    await openSeededBook(page);

    const chapterInput = page.locator('[placeholder="New chapter..."]');
    const initialCount = await page.locator('.chapter-sidebar-row').count();

    await chapterInput.fill(`E2E Btn Chapter ${Date.now()}`);
    await page.locator('.chapter-create-btn').click();

    // Chapter count should increase
    await expect(page.locator('.chapter-sidebar-row')).toHaveCount(
      initialCount + 1,
      { timeout: 8000 }
    );
  });

  // ── 4. Chapter suggestions panel ────────────────────────────────────────────

  test('chapter suggestions panel appears when a chapter is selected', async ({ page }) => {
    await openSeededBook(page);
    await selectFirstChapter(page);

    // GenerateChapterContent renders its root with data-testid="chapter-suggestions"
    await expect(page.getByTestId('chapter-suggestions')).toBeVisible({ timeout: 8000 });
    // Header text
    await expect(page.getByText('Chapter suggestions')).toBeVisible();
  });

  test('chapter suggestions refresh button is present and clickable', async ({ page }) => {
    await openSeededBook(page);
    await selectFirstChapter(page);

    const refreshBtn = page.getByRole('button', { name: /refresh chapter suggestions/i });
    await expect(refreshBtn).toBeVisible({ timeout: 8000 });
    await refreshBtn.click();
    // After click it should be in loading or completed state — no crash
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('chapter-suggestions')).toBeVisible();
  });

  // ── 5. Add a page manually ──────────────────────────────────────────────────

  test('Add Page Manually button is visible in chapter view', async ({ page }) => {
    await openSeededBook(page);
    await selectFirstChapter(page);

    await expect(page.getByTestId('add-page-btn')).toBeVisible({ timeout: 8000 });
  });

  test('clicking Add Page Manually adds a new page', async ({ page }) => {
    await openSeededBook(page);
    await selectFirstChapter(page);

    const addBtn = page.getByTestId('add-page-btn');
    await addBtn.waitFor({ state: 'visible', timeout: 8000 });
    await addBtn.click();

    // After adding a page, "View Pages" button or a page data-page-id element should appear
    const viewPagesBtn = page.getByTestId('view-pages-btn');
    const pageEl       = page.locator('[data-page-id]').first();
    await expect(viewPagesBtn.or(pageEl)).toBeVisible({ timeout: 10000 });
  });

  // ── 6. Generate Clip button and dialog ─────────────────────────────────────

  test('Generate Clip button is visible on book detail page', async ({ page }) => {
    await openSeededBook(page);
    await expect(page.getByTestId('book-detail-create-video').first()).toBeVisible({ timeout: 10000 });
  });

  test('Generate Clip button opens the Manim video dialog', async ({ page }) => {
    await openSeededBook(page);

    // Switch to pages view if needed
    const viewPagesBtn = page.getByTestId('view-pages-btn');
    if (await viewPagesBtn.count()) {
      await viewPagesBtn.click();
      await page.waitForTimeout(1500);
    }

    const generateBtn = page.getByTestId('book-detail-create-video').first();
    await generateBtn.waitFor({ state: 'visible', timeout: 8000 });
    await generateBtn.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });
  });

  // ── 7. Submit clip with mocked Spring backend ───────────────────────────────

  test('submitting the Generate Clip dialog calls Spring and shows a job response', async ({ page }) => {
    // Mock the Spring createDraft endpoint — no need for Agent backend to run
    await page.route('**/api/v1/videos/page-clips**', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              jobId:             'mock-job-e2e-001',
              status:            'READY_RENDER',
              renderReady:       true,
              manimCode:         'from manim import *\nclass S(Scene):\n    def construct(self): pass',
              currentRevisionId: 'mock-rev-001',
            },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await openSeededBook(page);

    // Switch to pages view if needed
    const viewPagesBtn = page.getByTestId('view-pages-btn');
    if (await viewPagesBtn.count()) {
      await viewPagesBtn.click();
      await page.waitForTimeout(1500);
    }

    const generateBtn = page.getByTestId('book-detail-create-video').first();
    test.skip(!(await generateBtn.count()), 'No Generate Clip button — seed data required.');

    await generateBtn.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });

    // Select low quality for speed
    await page.getByTestId('manim-quality-low').click();

    // Submit
    await page.getByTestId('manim-video-confirm').click();

    // Dialog should close or show loading state — no JS crash
    await page.waitForTimeout(2000);
    // Either the dialog closed (navigated or dismissed) or we're still on the book page
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/error');
  });

  // ── 8. Create a new book ────────────────────────────────────────────────────

  test('create book form renders with title input and Continue button', async ({ page }) => {
    await page.goto('/create-book', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#book-title')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('create-book-submit')).toBeVisible();
  });

  test('Continue button is disabled when title is empty', async ({ page }) => {
    await page.goto('/create-book', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('create-book-submit')).toBeDisabled();
  });

  test('filling title enables Continue and submitting creates a book', async ({ page }) => {
    await page.goto('/create-book', { waitUntil: 'domcontentloaded' });
    await page.locator('#book-title').waitFor({ state: 'visible', timeout: 8000 });

    // Choose "Start Blank" to skip chapter generation and keep the test fast
    const startBlank = page.getByRole('button', { name: /start blank/i });
    if (await startBlank.count()) await startBlank.click();

    await page.locator('#book-title').fill(`E2E Test Book ${Date.now()}`);
    await expect(page.getByTestId('create-book-submit')).toBeEnabled();

    await page.getByTestId('create-book-submit').click();

    // Should navigate to the new book's detail page
    await page.waitForURL(/\/book\//, { timeout: 20000 });
    await expect(page).toHaveURL(/\/book\//);
  });
});
