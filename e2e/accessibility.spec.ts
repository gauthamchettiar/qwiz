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

test('a guess_letters question (letter bank + answer row) has no serious accessibility violations', async ({
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

test('a group_items question (bucket board) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a fill_blanks question (bank mode) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

test('a fill_blanks question (type mode) has no serious accessibility violations', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'fill_blanks: The ___ is the powerhouse of the ___.',
          '{',
          '=mitochondria',
          '=cell',
          '~nucleus',
          '}',
          ':answer_mode=type'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);
  await page.goto(`/local/play?id=${quiz.id}`);
  await expectNoSeriousA11yViolations(page);
});

// Every theme is its own colour contract, and a token set that reads fine in the default light
// theme can fail outright in another — a muted ink that clears 4.5:1 on white can land at 3:1 on
// a dark surface. So the contrast suite runs per theme rather than once: this is the check that
// makes adding a theme a bounded piece of work instead of an open risk.
//
// Two screens each rather than all of them: the builder is the densest arrangement of text on
// tinted surfaces in the app (settings rows, option cards, the error pill), and a revealed answer
// is where the positive/negative tokens are actually used as text. Between them they touch every
// token group.
for (const theme of [
  'light',
  'vscode-light',
  'solarized-light',
  'gruvbox-light',
  'dark',
  'vscode-dark',
  'solarized-dark',
  'gruvbox-dark',
  'nord',
  'dracula',
  'monokai',
  'one-dark',
  'tokyo-night'
]) {
  test(`the ${theme} theme has no serious accessibility violations`, async ({ page }) => {
    const quiz = buildQuiz();
    await seedQuizzes(page, [quiz]);
    await page.evaluate((t) => localStorage.setItem('qwiz:theme', t), theme);

    await page.goto(`/local/edit?id=${quiz.id}`);
    await expectNoSeriousA11yViolations(page);

    await page.goto(`/local/play?id=${quiz.id}`);
    await page.getByLabel('Paris', { exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expectNoSeriousA11yViolations(page);
  });
}
