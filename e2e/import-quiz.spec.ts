import { expect, test } from '@playwright/test';
import { SAMPLE_QWIZ_SOURCE } from './fixtures/quizzes';
import { HomePage } from './pages/HomePage';
import { resetStorage } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('importing a pasted .qwiz document adds it to the list', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();
  await home.importButton.click();

  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill(SAMPLE_QWIZ_SOURCE);
  await dialog.getByRole('button', { name: 'Validate & Import' }).click();

  await expect(page).toHaveURL('/');
  await home.expectListed('Imported Sample Quiz');
});

test('shows parse errors instead of importing when the source is invalid', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();
  await home.importButton.click();

  const dialog = page.getByRole('dialog');
  await dialog.locator('textarea').fill('not a valid document at all');
  await dialog.getByRole('button', { name: 'Validate & Import' }).click();

  await expect(dialog.getByText(/Question 1:/)).toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(dialog).toBeVisible();
});

test('Escape closes the import dialog', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();
  await home.importButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
