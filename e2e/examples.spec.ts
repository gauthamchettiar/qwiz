import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { parseQwizFile } from '../src/lib/utils/quizScript';
import type { Quiz } from '../src/lib/schemas/quiz';
import { PlayPage } from './pages/PlayPage';
import { isAppConsoleMessage, stubExternalEmbeds } from './utils/network';
import { resetStorage, seedQuizzes } from './utils/storage';

// The examples in examples/ are the first thing a new author plays, and they're the app's own
// demonstration that the format works. Parsing them (sampleQuizzes.test.ts) only proves they're
// syntactically valid — these actually play them, which is what caught a question whose %N% option
// weights could never pay out because it lacked (and, as a single_choice, couldn't have)
// partial_credit, while its own analysis note claimed otherwise.
const files = readdirSync('examples')
  .filter((f) => f.endsWith('.qwiz'))
  .sort();

/** Builds a playable Quiz straight from an example file, with the run-shaping settings overridden so
 * a test can walk every question deterministically. Not via `importQwizSource`, which writes to
 * localStorage and so can't run in the Node test process. */
function load(file: string, overrides: Record<string, unknown> = {}): Quiz {
  const { frontmatter, questionCodes, errors } = parseQwizFile(
    readFileSync(`examples/${file}`, 'utf8')
  );
  if (errors.length > 0) throw new Error(`${file} does not parse: ${errors.join('; ')}`);
  const now = new Date().toISOString();
  return {
    id: `example-${file}`,
    title: frontmatter.title,
    description: frontmatter.description,
    category: frontmatter.category,
    tags: frontmatter.tags,
    settings: {
      ...frontmatter.settings,
      shuffle_questions: false,
      questions_per_run: 99,
      ...overrides
    },
    createdAt: now,
    updatedAt: now,
    questions: questionCodes.map((code, i) => ({ id: `q${i + 1}`, code }))
  };
}

for (const file of files) {
  test(`${file} renders every question without a page error`, async ({ page, baseURL }) => {
    await stubExternalEmbeds(page);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Only the app's own console output counts. A third-party embed logging something says nothing
    // about this app, and it isn't ours to fix — Firefox reports YouTube's rejected cross-site
    // cookie as an error, which failed this test in CI while the app was working perfectly.
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      if (!isAppConsoleMessage(m.location().url, baseURL ?? '')) return;
      errors.push(`console: ${m.text()}`);
    });

    // Deferred reveal + no timer + no subset, so every question can be visited by paging forward.
    const probe = load(file, {
      reveal_answers: 'at_end',
      reveal_scores: 'at_end',
      timer_mode: 'off'
    });

    await page.goto('/');
    await resetStorage(page);
    await seedQuizzes(page, [probe]);
    const play = new PlayPage(page);
    await play.goto(probe.id);

    const total = probe.questions.length;
    await expect(play.progressLabel()).toHaveText(`Question 1 of ${total}`);
    for (let i = 1; i < total; i++) {
      await page.getByRole('button', { name: 'Next question' }).click();
      await expect(play.progressLabel()).toHaveText(`Question ${i + 1} of ${total}`);
    }
    // Submit the lot and land on results + review, exercising grading for every variant present.
    await page.getByRole('button', { name: 'Submit quiz', exact: true }).click();
    await page.getByRole('button', { name: /Are you sure/ }).click();
    await expect(play.resultHeading()).toBeVisible();
    await play.reviewAnswersButton.click();
    await expect(page.getByText(/^Question \d+ of \d+$/).first()).toBeVisible();

    expect(errors, `${file}: ${errors.join(' ;; ')}`).toEqual([]);
  });
}

test('pub quiz: revealing a hint shows it and costs a point', async ({ page }) => {
  const quiz = load('01-pub-quiz-night.qwiz');
  await page.goto('/');
  await resetStorage(page);
  await seedQuizzes(page, [quiz]);
  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: /Nudge me/ }).click();
  await expect(page.getByText(/They do it at dusk/)).toBeVisible();

  await page.getByLabel('Starlings', { exact: true }).check();
  await play.submitAnswerButton.click();
  // points_correct=2 on this question, hint costs 1 → 1 of a max of 2.
  await expect(page.getByRole('status')).toContainText('1 / 2 points');
  await expect(page.getByText('Partly correct')).toBeVisible();
});

test('hangman: guessing letters reveals them and a wrong guess is penalised', async ({ page }) => {
  const quiz = load('02-hangman-holiday.qwiz');
  await page.goto('/');
  await resetStorage(page);
  await seedQuizzes(page, [quiz]);
  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // "[M]urder": M is pre-revealed, so it starts visible and the rest are blanks.
  await expect(page.getByRole('group', { name: 'Answer, revealed so far' })).toContainText('M');
  for (const letter of ['u', 'r', 'd', 'e']) {
    await page.getByRole('button', { name: letter, exact: true }).click();
  }
  await expect(page.getByRole('group', { name: 'Answer, revealed so far' })).toContainText(
    'Murder'
  );
  await play.submitAnswerButton.click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
});

test('picture round: the weighted near-miss still scores', async ({ page }) => {
  await stubExternalEmbeds(page);
  const quiz = load('09-picture-round.qwiz');
  await page.goto('/');
  await resetStorage(page);
  await seedQuizzes(page, [quiz]);
  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Q3 is multiple_choice, so it renders checkboxes rather than radios.
  for (let i = 0; i < 3; i++) {
    const radios = page.getByRole('radio');
    const control =
      (await radios.count()) > 0 ? radios.first() : page.getByRole('checkbox').first();
    await control.check();
    await play.submitAnswerButton.click();
    await play.nextQuestionButton.click();
  }
  // Q4 is the weighted one: Argentina is wrong but worth 1 of the 3 on offer.
  await page.getByLabel('Argentina', { exact: true }).check(); // checkbox now
  await play.submitAnswerButton.click();
  await expect(page.getByRole('status')).toContainText('1 / 3 points');
});
