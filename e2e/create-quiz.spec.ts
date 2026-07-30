import { expect, test } from '@playwright/test';
import { BuilderPage } from './pages/BuilderPage';
import { HomePage } from './pages/HomePage';
import { resetStorage, simulateStorageFull } from './utils/storage';

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

  // Regression check (mobile project): the quiz metadata card's code-toggle button and each
  // question card's play/code/clone/delete strip used to be absolutely positioned to the left of
  // their card unconditionally, relying on desktop-only margin outside the page's max-w-3xl
  // container that doesn't exist on narrow viewports — pushing them off-screen and inflating the
  // page's scrollable width even though nothing looked wrong until you actually looked for a
  // horizontal scrollbar.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

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

test('shows an error instead of silently losing the quiz when storage is full', async ({
  page
}) => {
  await simulateStorageFull(page);

  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Will Not Fit');
  await builder.addQuestion();
  await builder.fillChoiceQuestion('Untitled question', 'a', 'b');
  await builder.saveButton.click();

  await expect(page.getByText(/storage might be full/)).toBeVisible();
  // Never navigated away — a "Saved" flash or a redirect to /local/edit would both be lying
  // about whether the quiz actually persisted.
  await expect(page).toHaveURL('/local/create');
});

test('a save blocked by a missing title says so and puts the cursor in the title', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // Enough questions that the Save button and the title are not on screen together — which is the
  // whole problem: the click used to look like it did nothing at all.
  for (let i = 0; i < 4; i++) {
    await builder.addQuestion();
    await builder.fillChoiceQuestion(`Question ${i + 1}`, 'right', 'wrong');
  }

  await builder.saveButton.click();

  await expect(page.getByRole('alert')).toContainText('Title is required.');
  await expect(builder.titleInput).toBeFocused();
});

test("a save blocked by a question's broken code says so instead of dropping the edit", async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Has a broken question');
  await builder.addQuestion();
  await builder.fillChoiceQuestion('A fine question', 'right', 'wrong');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  // An option block that is never closed — the parser reports this, so the draft can't commit.
  await page.locator('main textarea.font-mono').fill('A fine question\n{\n=right');

  await builder.saveButton.click();

  await expect(page.getByRole('alert')).toContainText("A question's code has an error");
  await expect(builder.savedFlash).toHaveCount(0);
});
