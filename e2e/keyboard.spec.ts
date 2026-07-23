import { expect, test } from '@playwright/test';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('arrow keys + Enter select a suggested category', async ({ page }) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  const category = page.getByLabel('Category', { exact: true });
  // Click before fill: the dropdown only opens on a real focus event (onfocus), and on touch
  // devices `.fill()` alone doesn't reliably produce one the way a real tap does.
  await category.click();
  await category.fill('geo');
  await page.getByRole('option', { name: 'geography' }).waitFor();
  await category.press('ArrowDown');
  await category.press('Enter');

  await expect(category).toHaveValue('geography');
});

test('Enter adds a tag, and Backspace on an empty draft removes the last one', async ({ page }) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  const tagInput = page.getByLabel('Add tag', { exact: true });
  await tagInput.fill('quiznight');
  await tagInput.press('Enter');
  await expect(page.getByText('quiznight', { exact: true })).toBeVisible();
  await expect(tagInput).toHaveValue('');

  await tagInput.press('Backspace');
  await expect(page.getByText('quiznight', { exact: true })).toHaveCount(0);
});

test("Escape exits the quiz metadata card's code mode back to the plain fields", async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  await page.getByRole('button', { name: 'Edit quiz code' }).click();
  // `.font-mono` picks out the code editor specifically: an unscoped `textarea` locator would
  // match the header's always-mounted (hidden) import textarea before Escape, and the
  // Description textarea once Escape reveals the plain fields again.
  const codeEditor = page.locator('main textarea.font-mono');
  await expect(codeEditor).toBeVisible();
  await expect(builder.titleInput).toBeHidden();

  await codeEditor.press('Escape');
  await expect(codeEditor).toBeHidden();
  await expect(builder.titleInput).toBeVisible();
});
