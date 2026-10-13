import { test, expect } from '@playwright/test';

const requestId = '00000000-0000-0000-0000-000000000001';
async function fixture(page, { required = true, historyError = false, request = {} } = {}) {
  const state = {
    request: { id: requestId, proposedAccountName: 'Example Business', requestedSlug: 'example-business', status: 'SUBMITTED',
      requesterDisplayName: 'Requester', requesterEmail: 'requester@example.test', contactPersonName: 'Contact',
      contactEmail: 'contact@example.test', country: 'Nepal', website: 'https://example.test', submittedAt: '2026-10-03T12:00:00', ...request },
    history: [], calls: [], historyError,
  };
  await page.route('**/src/lib/firebase.js*', (route) => route.fulfill({ contentType: 'text/javascript',
    body: `export const auth = {currentUser: {getIdToken: async () => 'fixture-token'}};` }));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    state.calls.push({ path, method: req.method(), body: req.postDataJSON() });
    if (path.endsWith('/verifications')) {
      if (req.method() === 'GET') return state.historyError ? reply({ message: 'Verification history unavailable' }, 500)
        : reply({ requiredForApproval: required, items: state.history });
      const input = req.postDataJSON();
      state.history.unshift({ id: String(state.history.length + 1), requestId, ...input, createdAt: '2026-10-03T12:00:00' });
      state.request.status = input.outcome === 'PASSED' ? 'VERIFIED' : 'UNDER_REVIEW';
      return reply(state.history[0], 201);
    }
    if (path.endsWith('/approve')) { state.request.status = 'APPROVED'; return reply({ request: state.request }); }
    if (path === '/api/v1/admin/enterpriseOnboardingRequest') {
      const items = !url.searchParams.get('status') || url.searchParams.get('status') === state.request.status ? [state.request] : [];
      return reply({ items, page: { number: 0, size: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 } });
    }
    if (path === `/api/v1/admin/enterpriseOnboardingRequest/${requestId}`) return reply(state.request);
    return reply({ message: 'Unhandled fixture endpoint' }, 500);
  });
  await page.goto('/e2e/fixtures/enterpriseOperations.html');
  if (request.status && request.status !== 'SUBMITTED') {
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('');
  }
  await expect(page.getByRole('row', { name: /Example Business/ })).toBeVisible();
  return state;
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`request details wrap long unbroken text without horizontal scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const description = `${'a'.repeat(1800)}\nA second paragraph stays on its own line.`;
    const notes = 'Approved: ' + 'b'.repeat(1800);
    await fixture(page, { required: false, request: {
      status: 'APPROVED', businessDescription: description, decisionReason: notes,
      contactPersonName: 'Contact'.repeat(20), requestedSlug: 'workspace'.repeat(11),
    } });
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveCSS('border-radius', '8px');
    const overview = dialog.getByText(description, { exact: true });
    await expect(overview).toBeVisible();
    await expect(dialog.getByText(notes, { exact: true })).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const layout = await overview.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      text: element.textContent,
    }));
    expect(layout.height).toBeGreaterThan(layout.lineHeight * 2);
    expect(layout.text).toBe(description);
    await dialog.screenshot({ path: `/tmp/airabook-request-details-wrapped-${viewport.width}.png` });
  });
}

test('required verification gates approval and a passed review unlocks it', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('A passed verification is required before approval.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toHaveCSS('border-radius', '8px');
  await expect(page.getByLabel('Verification outcome')).toHaveCSS('border-radius', '8px');
  await page.getByRole('button', { name: 'Record verification' }).click();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeEnabled();
  expect(state.calls.find((call) => call.path.endsWith('/verifications') && call.method === 'POST').body)
    .toEqual({ outcome: 'PASSED', reasonCode: 'MANUAL_REVIEW_COMPLETED' });
  await page.getByRole('button', { name: 'Approve Enterprise' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.request.status).toBe('APPROVED');
});

test('failed verification retains the approval gate', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByLabel('Verification outcome').selectOption('FAILED');
  await expect(page.getByLabel('Verification reason')).toHaveValue('INSUFFICIENT_INFORMATION');
  await page.getByRole('button', { name: 'Record verification' }).click();
  await expect(page.getByText(/Failed · Insufficient Information/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
  expect(state.request.status).toBe('UNDER_REVIEW');
});

test('optional policy allows approval without a verification', async ({ page }) => {
  await fixture(page, { required: false });
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('Verification is optional under the current review policy.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeEnabled();
});

test('failed verification-history load cannot silently bypass required policy', async ({ page }) => {
  const state = await fixture(page, { historyError: true });
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
  state.historyError = false;
  await page.getByRole('button', { name: 'Reload details' }).click();
  await expect(page.getByLabel('Verification outcome')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
});

test('history refresh failure after saving cannot leave a stale approval gate', async ({ page }) => {
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Record verification' }).click();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeEnabled();
  await page.getByLabel('Verification outcome').selectOption('FAILED');
  state.historyError = true;
  await page.getByRole('button', { name: 'Record verification' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
  state.historyError = false;
  await page.getByRole('button', { name: 'Reload details' }).click();
  await expect(page.getByText(/Failed · Insufficient Information/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve Enterprise' })).toBeDisabled();
});
