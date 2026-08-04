import { expect, test } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { stubRepo } from './utils/github';
import { resetStorage, storedQuizCount } from './utils/storage';

/** Two questions per quiz, with distinct correct answers so a merged run can be told apart from a
 * single one by what it asks. `shuffle_questions` is pinned off wherever order is asserted. */
function quiz(title: string, a: string, b: string, extra: string[] = []) {
  return [
    '---',
    `title: ${title}`,
    ':shuffle_questions=false',
    ...extra,
    '---',
    '',
    `type_answer: ${a}?`,
    '{',
    `=${a}`,
    '}',
    '',
    `type_answer: ${b}?`,
    '{',
    `=${b}`,
    '}'
  ].join('\n');
}

function manifest(mode: string, ...extra: string[]) {
  return [
    '---',
    `title: The ${mode} Group`,
    `:mode=${mode}`,
    ...extra,
    '---',
    '',
    'quiz: one.qwiz',
    '',
    'quiz: two.qwiz'
  ].join('\n');
}

const QUIZZES = {
  'one.qwiz': quiz('Quiz One', 'Alpha', 'Bravo'),
  'two.qwiz': quiz('Quiz Two', 'Charlie', 'Delta')
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

async function answer(play: PlayPage, text: string) {
  await play.typedAnswerInput.fill(text);
  await play.submitAnswerButton.click();
}

test('merge plays every question from every quiz as one run', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { '.qwizgroup': manifest('merge'), ...QUIZZES }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'Play all as one quiz' }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  // One quiz, titled by the group rather than by any of its sources.
  await expect(page.getByRole('heading', { name: 'The merge Group', level: 1 })).toBeVisible();
  await play.start();

  // Four questions in one run: 2 + 2, in manifest order.
  await expect(play.progressLabel()).toHaveText('Question 1 of 4');
  for (const word of ['Alpha', 'Bravo', 'Charlie']) {
    await answer(play, word);
    await play.nextQuestionButton.click();
  }
  await answer(play, 'Delta');
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  expect(await storedQuizCount(page)).toBe(0);
});

test('merge honours a group-wide setting, which is how an exam draw works', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { '.qwizgroup': manifest('merge', ':questions_per_run=2'), ...QUIZZES }
  });

  await page.goto('/group/play?repo=owner%2Frepo');
  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();

  // Four questions exist; the group asked for two. No dedicated feature — questions_per_run is an
  // ordinary quiz-wide setting that lands in the synthesised document.
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
});

test('a merged run keeps each source quiz own inheritable settings', async ({ page }) => {
  // `points_correct` rather than `points_wrong`: both inherit, but a wrong answer without
  // `partial_credit` scores the whole question 0 by design (grading's exact-match path is binary),
  // so a penalty wouldn't be visible on screen. What each question is WORTH always is.
  await stubRepo(page, 'owner', 'repo', {
    files: {
      // Pinned on the MANIFEST, not on the source quizzes: a merged run takes its quiz-wide
      // settings from the group, so each source's own `shuffle_questions=false` doesn't reach it
      // and the merged questions would otherwise come back in a random order.
      '.qwizgroup': manifest('merge', ':shuffle_questions=false'),
      // Only the first quiz is worth 5 a question. Naive concatenation would drop that, since a
      // question inherits quiz-wide settings from the document it was lifted out of.
      'one.qwiz': quiz('Quiz One', 'Alpha', 'Bravo', [':points_correct=5']),
      'two.qwiz': quiz('Quiz Two', 'Charlie', 'Delta')
    }
  });

  await page.goto('/group/play?repo=owner%2Frepo');
  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();

  // 5 + 5 + 1 + 1: the first quiz kept its own scoring, the second kept the default.
  await expect(page.getByText('Score: 0 / 12')).toBeVisible();

  await answer(play, 'Alpha');
  await expect(page.getByText('5 / 5 points')).toBeVisible();
});

test('playlist chains the quizzes and totals them on one scoreboard', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { '.qwizgroup': manifest('playlist'), ...QUIZZES }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'Play all in order' }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await expect(page.getByText('Quiz 1 of 2')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quiz One', level: 1 })).toBeVisible();
  await play.start();

  await answer(play, 'Alpha');
  await play.nextQuestionButton.click();
  await answer(play, 'Bravo');
  await play.seeResultsButton.click();

  // Mid-run the player offers Continue rather than "Play again" — retaking a scored stage is
  // exactly what a sequenced group isn't.
  await expect(play.playAgainButton).toBeHidden();
  await page.getByRole('button', { name: 'Next quiz' }).click();

  await expect(page.getByText('Quiz 2 of 2')).toBeVisible();
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();
  await answer(play, 'Charlie');
  await play.nextQuestionButton.click();
  await answer(play, 'Delta');
  await play.seeResultsButton.click();
  await page.getByRole('button', { name: 'See group results' }).click();

  // One scoreboard across both quizzes.
  await expect(page.getByRole('heading', { name: 'The playlist Group' })).toBeVisible();
  await expect(page.getByText('across 2 quizzes')).toBeVisible();
  await expect(page.getByText('Quiz One')).toBeVisible();
  await expect(page.getByText('Quiz Two')).toBeVisible();
  expect(await storedQuizCount(page)).toBe(0);
});

test('shuffle draws a subset of the group', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { '.qwizgroup': manifest('shuffle', ':pick=1'), ...QUIZZES }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'Play a random draw' }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();

  // One of the two quizzes was drawn, so two questions rather than four — whichever it was.
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
});

test('folders offers no Play action, because it is a browser and not a run', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { '.qwizgroup': manifest('folders'), ...QUIZZES }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('link', { name: 'one' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Play all/ })).toBeHidden();
});

test('a group whose quizzes cannot be read says so rather than playing nothing', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': manifest('merge'),
      'one.qwiz': '---\ntitle: Broken\n---\n\npick_one: no options here',
      'two.qwiz': '---\ntitle: Also broken\n---\n\npick_one: nor here'
    }
  });

  await page.goto('/group/play?repo=owner%2Frepo');
  await expect(page.getByRole('alert')).toContainText(/could be read/);
});

test('one broken quiz is skipped and the rest of the group still plays', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': manifest('merge'),
      'one.qwiz': QUIZZES['one.qwiz'],
      'two.qwiz': '---\ntitle: Broken\n---\n\npick_one: no options here'
    }
  });

  await page.goto('/group/play?repo=owner%2Frepo');
  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await expect(page.getByText(/Skipped/)).toBeVisible();

  await play.start();
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
});
