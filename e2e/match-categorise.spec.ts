import { expect, test } from '@playwright/test';
import { buildCategoriseQuiz, buildMatchQuiz } from './fixtures/quizzes';
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
  await page.getByLabel('Variant', { exact: true }).selectOption('match');
  await builder.questionTextInput().fill('Match capitals');

  await expect(page.getByRole('checkbox', { name: 'Correct' })).toHaveCount(0);

  await page.getByPlaceholder('Item').nth(0).fill('Paris');
  await page.getByPlaceholder('Matches with').nth(0).fill('France');
  await page.getByRole('button', { name: 'Add option' }).click();
  await page.getByPlaceholder('Item').nth(1).fill('Tokyo');
  await page.getByPlaceholder('Matches with').nth(1).fill('Japan');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.locator('main textarea.font-mono')).toHaveValue(
    /=Paris -> France[\s\S]*=Tokyo -> Japan/
  );
});

test('authoring a categorise question uses "Bucket" as the target placeholder', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Categorise Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('categorise');
  await builder.questionTextInput().fill('Sort animals');

  await page.getByPlaceholder('Item').nth(0).fill('Fish');
  await page.getByPlaceholder('Bucket').nth(0).fill('Water');
  await page.getByPlaceholder('Item').nth(1).fill('Lion');
  await page.getByPlaceholder('Bucket').nth(1).fill('Land');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.locator('main textarea.font-mono')).toHaveValue(
    /=Fish -> Water[\s\S]*=Lion -> Land/
  );
});

test('match: correct pairs win full credit, and re-pairing (stealing a used target) works', async ({
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

test('categorise: several items can correctly share one bucket', async ({ page }) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  async function assign(item: string, bucket: string) {
    await page.getByRole('button', { name: item, exact: true }).click();
    const bucketCard = page.getByText(bucket, { exact: true }).locator('..');
    await bucketCard.getByRole('button', { name: 'Place here' }).click();
  }

  await assign('Fish', 'Water');
  await assign('Frog', 'Water');
  await assign('Lion', 'Land');

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('categorise: picking an item back up from a bucket returns it to the pool', async ({
  page
}) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: 'Fish', exact: true }).click();
  const waterCard = page.getByText('Water', { exact: true }).locator('..');
  await waterCard.getByRole('button', { name: 'Place here' }).click();

  await waterCard.getByRole('button', { name: 'Fish', exact: true }).click();

  await expect(play.submitAnswerButton).toBeDisabled();
});
