import { test, expect } from '@playwright/test';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';

const login = async (page) => {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /log in|login/i }).click();
};

test.describe('Movies workspace smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run Movies smoke coverage.');
    await login(page);
  });

  test('renders either the empty state or the workspace shell', async ({ page }) => {
    await page.goto('/movies');

    const emptyState = page.getByTestId('movies-empty-state');
    const previewPanel = page.getByTestId('movies-preview-panel');

    if (await emptyState.count()) {
      await expect(emptyState).toBeVisible();
      return;
    }

    await expect(previewPanel).toBeVisible();
  });

  test('shows the page-level create video entry when a book page is open', async ({ page }) => {
    await page.goto('/books');

    const firstBookLink = page.locator('a[href^="/book/"]').first();
    test.skip(!(await firstBookLink.count()), 'No visible book card was available for smoke coverage.');

    await firstBookLink.click();
    await expect(page.getByTestId('book-detail-create-video')).toBeVisible();
  });
});
