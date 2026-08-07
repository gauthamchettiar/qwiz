import { expect, test } from '@playwright/test';
import { buildCategoriseQuiz, buildMatchQuiz, buildPictureMatchQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('authoring a match question has item/target pairs and no correct checkbox', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Match Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('match_pairs');
  await builder.questionTextInput().fill('Match capitals');

  await expect(page.getByRole('checkbox', { name: 'Correct' })).toHaveCount(0);

  await page.getByPlaceholder('Item').nth(0).fill('Paris');
  await page.getByPlaceholder('Matches with').nth(0).fill('France');
  await builder.addOption();
  await page.getByPlaceholder('Item').nth(1).fill('Tokyo');
  await page.getByPlaceholder('Matches with').nth(1).fill('Japan');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.getByRole('textbox', { name: 'Question .qwiz source' })).toHaveValue(
    /=Paris -> France[\s\S]*=Tokyo -> Japan/
  );
});

test('authoring a group_items question uses "Bucket" as the target placeholder', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Categorise Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('group_items');
  await builder.questionTextInput().fill('Sort animals');

  await page.getByPlaceholder('Item').nth(0).fill('Fish');
  await page.getByPlaceholder('Bucket').nth(0).fill('Water');
  await page.getByPlaceholder('Item').nth(1).fill('Lion');
  await page.getByPlaceholder('Bucket').nth(1).fill('Land');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.getByRole('textbox', { name: 'Question .qwiz source' })).toHaveValue(
    /=Fish -> Water[\s\S]*=Lion -> Land/
  );
});

test('match_pairs: correct pairs win full credit, and re-pairing (stealing a used target) works', async ({
  page
}) => {
  const quiz = buildMatchQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Deliberately wrong first, then fix it via re-picking/stealing.
  await page.getByRole('button', { name: 'Paris', exact: true }).click();
  await page.getByRole('button', { name: 'Japan', exact: true }).click();
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click();
  await page.getByRole('button', { name: 'France', exact: true }).click();

  // Fix: re-pick Paris (drops its wrong pairing with Japan), then steal France from Tokyo.
  await page.getByRole('button', { name: 'Paris', exact: true }).click();
  await page.getByRole('button', { name: 'France', exact: true }).click();
  // Tokyo is now unpaired (France was stolen) — pair it with the now-free Japan.
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click();
  await page.getByRole('button', { name: 'Japan', exact: true }).click();

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('match_pairs: a picture can be the item, the target, or both', async ({ page }) => {
  const quiz = buildPictureMatchQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // A picture column entry's accessible name is its alt text — the picture IS the label here, so
  // there's no separate caption for either column to be found by.
  await expect(page.getByRole('img', { name: 'Red swatch' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Blue swatch' })).toBeVisible();

  await page.getByRole('button', { name: 'Red swatch', exact: true }).click();
  await page.getByRole('button', { name: 'Red', exact: true }).click();
  await page.getByRole('button', { name: 'Blue', exact: true }).click();
  await page.getByRole('button', { name: 'Blue swatch', exact: true }).click();

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('group_items: several items can correctly share one bucket', async ({ page }) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Each bucket tray is a `role="group"` labelled with its own name — a stable handle for it,
  // rather than reaching it through the DOM shape around its label.
  async function assign(item: string, bucket: string) {
    await page.getByRole('button', { name: item, exact: true }).click();
    await page
      .getByRole('group', { name: bucket })
      .getByRole('button', { name: 'Place here' })
      .click();
  }

  await assign('Fish', 'Water');
  await assign('Frog', 'Water');
  await assign('Lion', 'Land');

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('group_items: picking an item back up from a bucket returns it to the pool', async ({
  page
}) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: 'Fish', exact: true }).click();
  const waterTray = page.getByRole('group', { name: 'Water' });
  await waterTray.getByRole('button', { name: 'Place here' }).click();

  await waterTray.getByRole('button', { name: 'Fish', exact: true }).click();

  // Asserted on the board itself rather than via a disabled Submit, which used to stand in for
  // "the assignment is incomplete" — Submit is always live now that questions are skippable.
  await expect(waterTray.getByRole('button', { name: 'Fish', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fish', exact: true })).toBeVisible();
});
