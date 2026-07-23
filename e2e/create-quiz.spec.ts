import { expect, test } from '@playwright/test';
import { BuilderPage } from './pages/BuilderPage';
import { HomePage } from './pages/HomePage';
import { resetStorage } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('creating a quiz through the builder saves it and lists it on the home page', async ({
  page
}) => {
  const home = new HomePage(page);
  await home.goto();
  await home.newQuizLink.click();
  await expect(page).toHaveURL('/local/create');

  const builder = new BuilderPage(page);
  await builder.titleInput.fill('Capitals Quiz');
  await builder.descriptionInput.fill('A quiz created end-to-end.');
  await builder.addQuestion();
  await builder.fillChoiceQuestion('What is the capital of France?', 'Paris', 'Lyon');
  await builder.saveButton.click();

  // A brand-new quiz's first save navigates to its real /local/edit?id=... URL.
  await expect(page).toHaveURL(/\/local\/edit\?id=.+/);
  await expect(builder.titleInput).toHaveValue('Capitals Quiz');

  await home.goto();
  await home.expectListed('Capitals Quiz');

  // Persistence: the quiz survives a reload, not just client-side navigation.
  await page.reload();
  await home.expectListed('Capitals Quiz');
});

test('the title is required to save', async ({ page }) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.addQuestion();
  await builder.fillChoiceQuestion('Untitled question', 'a', 'b');
  await builder.saveButton.click();

  await expect(page.getByText('Title is required.')).toBeVisible();
  await expect(page).toHaveURL('/local/create');
});
