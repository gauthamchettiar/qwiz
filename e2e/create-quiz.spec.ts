import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { HomePage } from './pages/HomePage';
import { resetStorage, seedQuizzes, simulateStorageFull } from './utils/storage';

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

test('Play on a brand-new quiz saves it first, then plays it', async ({ page }) => {
  // Play used to be hidden on /local/create, which left the Code button sitting alone in that
  // header slot looking like it had replaced it. Playing saves first — that save is what mints
  // the quiz's id — so the quiz genuinely exists by the time the player opens.
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Played Straight Away');
  await builder.addQuestion();
  await builder.fillChoiceQuestion('What is the capital of France?', 'Paris', 'Lyon');

  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page).toHaveURL(/\/local\/play\?id=.+/);
  await expect(page.getByText('What is the capital of France?')).toBeVisible();

  const home = new HomePage(page);
  await home.goto();
  await home.expectListed('Played Straight Away');
});

test('a question with errors shows a count in view mode that opens code mode', async ({ page }) => {
  // A saved question really can be broken — the form commits on every keystroke rather than only
  // once a question is valid — and before this the card said nothing about it outside code mode.
  // Seeded rather than authored, because reaching an invalid SAVED state through the UI means
  // leaving a card in form mode, which isn't what's under test here.
  const quiz = buildQuiz({
    questions: [
      { id: 'q1', code: 'pick_one: A question with no options at all\n{\n}' },
      { id: 'q2', code: 'pick_one: A perfectly good question\n{\n=Right\n~Wrong\n}' }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  // Exactly one card is broken, so exactly one pill.
  const errorPill = page.getByRole('button', { name: /^\d+ errors?$/ });
  await expect(errorPill).toHaveCount(1);
  await expect(errorPill).toHaveText('1 error');

  // The pill IS the way in to the messages, rather than something sitting next to it.
  await errorPill.click();
  const codeEditor = page.locator('main textarea.font-mono');
  await expect(codeEditor).toBeVisible();
  await expect(page.getByText('Question has no options.')).toBeVisible();

  // Fixing the question clears it.
  await codeEditor.fill('pick_one: Now it has options\n{\n=Right\n~Wrong\n}');
  await codeEditor.press('Escape');
  await expect(errorPill).toHaveCount(0);
});

test('Add image option builds a picture option with no per-row kind control', async ({ page }) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Picture Options');
  await builder.addQuestion();
  await builder.questionTextInput().fill('Which flag is this?');

  await page.getByRole('button', { name: 'Add image option' }).click();

  // The new row asks for alt + url directly — the kind was decided by the button that added it,
  // so there's no picker on the row to switch it afterwards.
  await expect(page.getByPlaceholder('alt text')).toHaveCount(1);
  await expect(page.getByPlaceholder('url')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Option content type/ })).toHaveCount(0);

  await page.getByPlaceholder('alt text').fill('A red circle on white');
  await page.getByPlaceholder('url').fill('https://example.com/jp.png');
  // A blank question starts out `pick_one`, whose correct marker is a radio group rather than
  // independent checkboxes — see QuestionForm's `isSingleChoice`.
  await page.getByRole('radio', { name: 'Correct' }).nth(2).check();

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.locator('main textarea.font-mono')).toHaveValue(
    /=!\[A red circle on white\]\(https:\/\/example\.com\/jp\.png\)/
  );
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
