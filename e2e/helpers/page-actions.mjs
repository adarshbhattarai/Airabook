import { expect } from '@playwright/test';

export const revealPageClipAction = async (page) => {
  const action = page.getByTestId('book-detail-create-video').first();
  const more = page.getByRole('button', { name: 'More page options', exact: true }).first();
  await expect(action.or(more).first()).toBeVisible();
  if (!await action.isVisible()) await more.click();
  await expect(action).toBeVisible();
  return action;
};
