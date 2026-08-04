import { expect, test, type Page } from '@playwright/test';
import { stubRepo } from './utils/github';
import { resetStorage, storedQuizCount } from './utils/storage';

/** A quiz of `count` one-point choice questions, each answerable right or wrong. */
function quiz(title: string, count: number) {
  const questions = Array.from({ length: count }, (_, i) =>
    [`Question ${i + 1} of ${title}?`, '{', '=Correct', '~Wrong', '}'].join('\n')
  );
  return ['---', `title: ${title}`, ':shuffle_questions=false', '---', '', ...questions].join(
    '\n\n'
  );
}

function manifest(...extra: string[]) {
  return [
    '---',
    'title: The Gauntlet',
    'description: Pick a category each round.',
    ':mode=gauntlet',
    ...extra,
    '---',
    '',
    'quiz: history/tudors.qwiz',
    '',
    'quiz: science/physics.qwiz',
    '',
    'quiz: loose.qwiz'
  ].join('\n');
}

const FILES = {
  '.qwizgroup': manifest(':rounds=2', ':questions_per_pick=2'),
  'history/tudors.qwiz': quiz('Tudors', 4),
  'science/physics.qwiz': quiz('Physics', 4),
  'loose.qwiz': quiz('Loose', 4)
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** Answers the questions of one round, then advances. */
async function playRound(page: Page, category: string, answer: 'Correct' | 'Wrong', perPick = 2) {
  await page.getByRole('button', { name: new RegExp(`^${category}`) }).click();
  for (let i = 0; i < perPick; i += 1) {
    await page.getByLabel(answer, { exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('button', { name: /Next question|Pick again|See results/ }).click();
  }
}

test('a gauntlet offers its subfolders as categories, with General last', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'Play' }).click();

  await expect(page.getByRole('heading', { name: 'Pick a category' })).toBeVisible();
  await expect(page.getByText('Round 1 of 2')).toBeVisible();
  await expect(page.getByText('2 questions from whichever you choose.')).toBeVisible();

  // Order matters: subfolders alphabetically, then General — the leftovers aren't a subject
  // anyone chose to create, so they go last.
  const categories = page.getByRole('button', { name: /questions? left/ });
  await expect(categories).toHaveCount(3);
  await expect(categories.nth(0)).toContainText('history');
  await expect(categories.nth(1)).toContainText('science');
  await expect(categories.nth(2)).toContainText('General');
});

test('picking a category asks its questions, then returns to the picker', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group/play?repo=owner%2Frepo');

  await page.getByRole('button', { name: /^history/ }).click();
  await expect(page.getByText('Round 1 of 2 · history')).toBeVisible();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();

  await page.getByLabel('Correct', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByText('Question 2 of 2')).toBeVisible();

  await page.getByLabel('Correct', { exact: true }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await page.getByRole('button', { name: 'Pick again' }).click();

  await expect(page.getByRole('heading', { name: 'Pick a category' })).toBeVisible();
  await expect(page.getByText('Round 2 of 2')).toBeVisible();
  await expect(page.getByText('Averaging 100% so far')).toBeVisible();
});

test('a run ends after its rounds and scores on the average of them', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  await playRound(page, 'science', 'Wrong');

  // 100% and 0% averages to 50% — and the average is what's reported, not the point total, so a
  // category with heavier questions can't dominate.
  await expect(page.getByRole('heading', { name: /Gauntlet/ })).toBeVisible();
  await expect(page.getByText('50% average across 2 rounds')).toBeVisible();
  await expect(page.getByText('Round 1 · history')).toBeVisible();
  await expect(page.getByText('Round 2 · science')).toBeVisible();
});

test('clearing the pass mark says so', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  await playRound(page, 'science', 'Correct');

  await expect(page.getByRole('heading', { name: 'Gauntlet cleared!' })).toBeVisible();
  await expect(page.getByText('100% average across 2 rounds')).toBeVisible();
});

test('a run never asks the same question twice', async ({ page }) => {
  // The property that matters most: a gauntlet deliberately returns to the same categories, so
  // without tracking what's been used a player would see repeats.
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': manifest(':rounds=2', ':questions_per_pick=2'),
      'history/tudors.qwiz': quiz('Tudors', 4),
      'science/physics.qwiz': quiz('Physics', 4),
      'loose.qwiz': quiz('Loose', 4)
    }
  });
  await page.goto('/group/play?repo=owner%2Frepo');

  await expect(page.getByRole('button', { name: /^history/ })).toContainText('4 questions left');
  await playRound(page, 'history', 'Correct');
  await expect(page.getByRole('button', { name: /^history/ })).toContainText('2 questions left');
});

test('a category with nothing left cannot be picked', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': manifest(':rounds=4', ':questions_per_pick=2'),
      'history/tudors.qwiz': quiz('Tudors', 2),
      'science/physics.qwiz': quiz('Physics', 4),
      'loose.qwiz': quiz('Loose', 4)
    }
  });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  await expect(page.getByRole('button', { name: /^history/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^science/ })).toBeEnabled();
});

test('a run stops early rather than looping when the group runs dry', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      // Four rounds asked for, but only two questions in the whole group.
      '.qwizgroup': [
        '---',
        'title: Tiny Gauntlet',
        ':mode=gauntlet',
        ':rounds=4',
        ':questions_per_pick=2',
        '---',
        '',
        'quiz: history/tudors.qwiz'
      ].join('\n'),
      'history/tudors.qwiz': quiz('Tudors', 2)
    }
  });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  await expect(page.getByRole('heading', { name: /Gauntlet/ })).toBeVisible();
  await expect(page.getByText('across 1 round')).toBeVisible();
});

test('a gauntlet can be run again from its results', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  await playRound(page, 'science', 'Correct');
  await page.getByRole('button', { name: 'Run it again' }).click();

  await expect(page.getByText('Round 1 of 2')).toBeVisible();
  // Every question is available again — a fresh run, not a continuation.
  await expect(page.getByRole('button', { name: /^history/ })).toContainText('4 questions left');
});

test('playing a gauntlet never adds anything to the library', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group/play?repo=owner%2Frepo');

  await playRound(page, 'history', 'Correct');
  expect(await storedQuizCount(page)).toBe(0);
});
