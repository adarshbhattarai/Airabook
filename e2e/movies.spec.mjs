import { test, expect } from '@playwright/test';

const email = process.env.PLAYWRIGHT_EMAIL || '';
const password = process.env.PLAYWRIGHT_PASSWORD || '';

const login = async (page) => {
  await page.goto('/login');
  await page.getByPlaceholder(/email address/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

test.describe('Movies workspace smoke', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!email || !password, 'Set PLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD to run Movies smoke coverage.');
    await login(page);
  });

  test('renders either the empty state or the Movies landing shell', async ({ page }) => {
    await page.goto('/movies');

    const emptyState = page.getByTestId('movies-empty-state');
    const landingShell = page.getByTestId('movies-landing-shell');

    if (await emptyState.count()) {
      await expect(emptyState).toBeVisible();
      return;
    }

    await expect(landingShell).toBeVisible();
    await expect(page.getByRole('button', { name: /create new movie/i })).toBeVisible();
    await expect(page.getByText(/movie library/i)).toBeVisible();
  });

  test('opens the create movie modal from the landing page', async ({ page }) => {
    await page.goto('/movies');

    const emptyState = page.getByTestId('movies-empty-state');
    test.skip(await emptyState.count(), 'No books were available for Movies workspace coverage.');

    await page.getByTestId('movies-create-new').click();
    await expect(page.getByTestId('movies-create-dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: /open movie workspace/i })).toBeVisible();
  });

  test('opens a movie card into the tabbed editor workspace', async ({ page }) => {
    await page.goto('/movies');

    const emptyState = page.getByTestId('movies-empty-state');
    test.skip(await emptyState.count(), 'No books were available for Movies workspace coverage.');

    const firstMovieCard = page.locator('[data-testid^="movies-book-card-"]').first();
    test.skip(!(await firstMovieCard.count()), 'No movie card was available for Movies workspace coverage.');

    await firstMovieCard.click();
    await expect(page.getByTestId('movies-preview-panel')).toBeVisible();
    await expect(page.getByTestId('movies-editor-tabs')).toBeVisible();
    await expect(page.getByTestId('movies-tab-movie')).toBeVisible();
    await expect(page.getByTestId('movies-tab-prompt')).toBeVisible();
    await expect(page.getByTestId('movies-page-strip')).toBeVisible();
    await expect(page.getByTestId('movies-pages-left')).toBeVisible();
    await expect(page.getByTestId('movies-pages-right')).toBeVisible();
  });

  test('shows the page-level create video entry when a book page is open', async ({ page }) => {
    await page.goto('/books');

    const firstBookLink = page.locator('a[href^="/book/"]').first();
    test.skip(!(await firstBookLink.count()), 'No visible book card was available for smoke coverage.');

    await firstBookLink.click();
    await expect(page.getByTestId('book-detail-create-video')).toBeVisible();
  });
});
