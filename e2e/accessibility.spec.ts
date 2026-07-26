import { test } from '@playwright/test';
import { buildCharacterInputQuiz, buildQuiz } from './fixtures/quizzes';
import { expectNoSeriousA11yViolations } from './utils/a11y';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('home page (empty state) has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expectNoSeriousA11yViolations(page);
});

test('home page with quizzes listed has no serious accessibility violations', async ({ page }) => {
  await seedQuizzes(page, [buildQuiz()]);
  await page.goto('/');
  await expectNoSeriousA11yViolations(page);
});

test('the create-quiz builder has no serious accessibility violations', async ({ page }) => {
  await page.goto('/local/create');
  await expectNoSeriousA11yViolations(page);
});

test('the play screen has no serious accessibility violations', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a character_input question (letter bank + answer row) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildCharacterInputQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});
