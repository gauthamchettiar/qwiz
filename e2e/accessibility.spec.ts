import { test } from '@playwright/test';
import {
  buildCategoriseQuiz,
  buildCharacterInputQuiz,
  buildFillInBlanksQuiz,
  buildMatchQuiz,
  buildOrderQuiz,
  buildQuiz
} from './fixtures/quizzes';
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

test('an order question (pick-and-place board) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a match question (two-column board) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildMatchQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a categorise question (bucket board) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a fill_in_blanks question (bank mode) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a fill_in_blanks question (type mode) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'fill_in_blanks: The ___ is the powerhouse of the ___.',
          '{',
          '=mitochondria',
          '=cell',
          '~nucleus',
          '}',
          ':blank_input=type'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});
