/**
 * Real end-to-end clip generation test.
 *
 * This test exercises the FULL stack — no mocks:
 *
 *   Browser UI
 *     → Spring backend  (localhost:8080)  createDraft + renderJob
 *       → Manim runner  (localhost:3033)  Python render → .mp4
 *         → Firebase Storage / GCS       upload + signed URL
 *     ← SSE stream      (localhost:8080)  RENDERING → COMPLETED
 *   Browser UI shows <video src="...">
 *
 * Prerequisites (all must be running):
 *   1. Firebase emulators:   npm run emulators:local   (Auth:9099, Firestore:8080, Storage:9199)
 *   2. Frontend:             npm run local              (Vite on localhost:5173)
 *   3. Spring backend:       ./mvnw spring-boot:run -pl agent   (port 8080, emulator mode)
 *   4. Manim Docker:         docker start manim-runner  (port 3033)
 *   5. Seed data:            npm run seed:data
 *
 * The test auto-skips when Spring or Manim are not reachable so CI never
 * fails when the stack is not up.
 *
 * Manim "low" quality takes ~30-90 s. The test has a 5-minute timeout.
 *
 * Run:
 *   PLAYWRIGHT_EMAIL=claude@airabook.dev PLAYWRIGHT_PASSWORD=Claude@Dev2024! \
 *     npx playwright test e2e/clip-generation.spec.mjs --timeout=300000
 */

import { test, expect, request } from '@playwright/test';

// ── env / constants ───────────────────────────────────────────────────────────

const email    = process.env.PLAYWRIGHT_EMAIL    || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';
const SEED_BOOK_ID = process.env.PLAYWRIGHT_BOOK_ID || 'book-debug-001';

const SPRING_BASE  = process.env.VITE_SPRING_API_URL || process.env.VITE_BACKEND_API_URL || 'http://localhost:8000';
const MANIM_BASE   = 'http://localhost:3033';

// Manim low quality renders in ~30-90 s. Allow 4 minutes for the full flow.
const RENDER_TIMEOUT_MS = 4 * 60 * 1000;

// ── helpers ───────────────────────────────────────────────────────────────────

const login = async (page) => {
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name="email"]').waitFor({ state: 'visible' });
  await page.locator('input[type="email"], input[name="email"]').fill(email);
  await page.locator('input[type="password"], input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  // Wait for the URL to leave /login (React Router SPA navigation may take ~20 s
  // on cold start because the Firebase Auth emulator + Firestore snapshot settle).
  try {
    await page.waitForFunction(
      () => !window.location.pathname.startsWith('/login'),
      { timeout: 40000 }
    );
  } catch (err) {
    console.log('=== LOGIN TIMEOUT — browser console ===');
    consoleLogs.forEach(l => console.log(l));
    console.log('=== Current URL:', page.url(), '===');
    throw err;
  }
};

/**
 * Returns true if the given URL responds with HTTP 200 within 3 seconds.
 * Used to skip the test when Spring or Manim are not running.
 */
const isReachable = async (url) => {
  try {
    const ctx = await request.newContext({ timeout: 10000 });
    const res  = await ctx.get(url);
    await ctx.dispose();
    return res.status() === 200;
  } catch {
    return false;
  }
};

// ── test ─────────────────────────────────────────────────────────────────────

test.describe('Manim clip generation — full stack', () => {
  // Give the whole suite 5 minutes (Manim render at low quality)
  test.setTimeout(5 * 60 * 1000);

  let springUp = false;
  let manimUp  = false;

  test.beforeAll(async () => {
    springUp = await isReachable(`${SPRING_BASE}/health`);
    manimUp  = await isReachable(`${MANIM_BASE}/health`);
    console.log(`beforeAll: springUp=${springUp}, manimUp=${manimUp}, email=${!!email}, password=${!!password}`);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(
      !email || !password,
      'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run clip generation tests.'
    );
    test.skip(
      !springUp,
      `Spring backend not reachable at ${SPRING_BASE}/health — start with: mvn spring-boot:run -pl agent -Dspring-boot.run.jvmArguments=-Dserver.port=8000`
    );
    test.skip(
      !manimUp,
      `Manim runner not reachable at ${MANIM_BASE} — start with: docker start manim-runner`
    );
    await login(page);
  });

  // ── 1. createDraft: dialog → /movies navigation ────────────────────────────

  test('Generate Clip dialog submits and navigates to /movies with a job ID', async ({ page }) => {
    // Navigate to seeded book
    await page.goto(`/book/${SEED_BOOK_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.chapter-sidebar-row, [data-testid="add-page-btn"]', { timeout: 10000 });
    await page.waitForTimeout(1500);

    // Switch to pages view if the button is present
    const viewPagesBtn = page.getByTestId('view-pages-btn');
    if (await viewPagesBtn.count()) {
      await viewPagesBtn.click();
      await page.waitForTimeout(1500);
    }

    // Find and click the Generate Clip button
    const generateBtn = page.getByTestId('book-detail-create-video').first();
    test.skip(!(await generateBtn.count()), `No Generate Clip button — seed book ${SEED_BOOK_ID} must have a page.`);

    await generateBtn.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });

    // Select "low" quality for the fastest possible render
    await page.getByTestId('manim-quality-low').click();

    // Confirm — this calls POST api/v1/videos/page-clips on Spring
    await page.getByTestId('manim-video-confirm').click();

    // Spring processes the draft workflow (LLM calls) and returns a jobId.
    // The app then navigates to /movies?...&jobId=<uuid>
    await page.waitForURL(/\/movies.*jobId=/, { timeout: 60000 });

    const url = new URL(page.url());
    const jobId = url.searchParams.get('jobId');
    expect(jobId).toBeTruthy();
    console.log(`Draft created — jobId: ${jobId}`);
  });

  // ── 2. Full render pipeline: draft → render → COMPLETED → video ─────────────

  test('clip renders end-to-end: READY_RENDER → RENDERING → COMPLETED → video preview', async ({ page }) => {
    // ── Step 1: create the draft ───────────────────────────────────────────────
    await page.goto(`/book/${SEED_BOOK_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.chapter-sidebar-row, [data-testid="add-page-btn"]', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const viewPagesBtn = page.getByTestId('view-pages-btn');
    if (await viewPagesBtn.count()) {
      await viewPagesBtn.click();
      await page.waitForTimeout(1500);
    }

    const generateBtn = page.getByTestId('book-detail-create-video').first();
    test.skip(
      !(await generateBtn.count()),
      `No Generate Clip button — seed book ${SEED_BOOK_ID} must have at least one page.`
    );

    await generateBtn.evaluate(el => { el.scrollIntoView({ block: 'center' }); el.click(); });
    await expect(page.getByTestId('manim-video-dialog')).toBeVisible({ timeout: 5000 });

    await page.getByTestId('manim-quality-low').click();
    await page.getByTestId('manim-video-confirm').click();

    // ── Step 2: wait for /movies and extract jobId ─────────────────────────────
    await page.waitForURL(/\/movies.*jobId=/, { timeout: 60000 });
    const url   = new URL(page.url());
    const jobId = url.searchParams.get('jobId');
    expect(jobId).toBeTruthy();
    console.log(`Draft created — jobId: ${jobId}`);

    // ── Step 3: Movies page must show the job row and READY_RENDER status ──────
    const jobRow = page.getByTestId(`movies-job-row-${jobId}`);
    await expect(jobRow).toBeVisible({ timeout: 15000 });
    console.log('Job row visible in Movies list.');

    // ── Step 4: click "Render clip" — sends POST .../render to Spring ──────────
    const renderBtn = page.getByTestId('movies-render-button');
    await expect(renderBtn).toBeEnabled({ timeout: 10000 });
    await renderBtn.click();
    console.log('Render clip clicked — Manim job dispatched.');

    // ── Step 5: status badge transitions RENDERING → COMPLETED ────────────────
    // First confirm RENDERING state (Spring is processing)
    const statusBadge = page.getByTestId('movies-job-status');
    await expect(statusBadge).toHaveText(/RENDERING|COMPLETED/, { timeout: 30000 });
    console.log(`Status: ${await statusBadge.textContent()}`);

    // Now wait for COMPLETED — Manim low-quality render takes ~30-90 s
    await expect(statusBadge).toHaveText('COMPLETED', { timeout: RENDER_TIMEOUT_MS });
    console.log('Status: COMPLETED ✅');

    // ── Step 6: video preview element must be visible with a real src ──────────
    const videoEl = page.getByTestId('movies-video-preview');
    await expect(videoEl).toBeVisible({ timeout: 10000 });

    const src = await videoEl.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toMatch(/https?:\/\//);
    console.log(`Video preview src: ${src}`);

    // ── Step 7: verify the src is actually reachable (HTTP 200 or 206) ─────────
    // Signed GCS URLs return 200; some storage emulators return 206 for range requests.
    const videoResp = await page.request.head(src, { timeout: 15000 });
    expect([200, 206]).toContain(videoResp.status());
    console.log(`Video URL responded with HTTP ${videoResp.status()} ✅`);
  });
});
