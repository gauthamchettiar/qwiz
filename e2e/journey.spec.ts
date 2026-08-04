import { expect, test, type Page } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { stubRepo } from './utils/github';
import { resetStorage, storedQuizCount } from './utils/storage';

/** One question, answerable correctly or not, so a spec can choose whether a run is won. */
function quiz(title: string, extra: string[] = []) {
  return [
    '---',
    `title: ${title}`,
    ':shuffle_questions=false',
    ...extra,
    '---',
    '',
    'Which one is right?',
    '{',
    '=Correct',
    '~Wrong',
    '}'
  ].join('\n');
}

const MANIFEST = [
  '---',
  'title: The Qwiz Trail',
  'description: Clear one to unlock the next.',
  ':mode=journey',
  ':require_win=false',
  '---',
  '',
  'quiz: capitals.qwiz',
  'id: capitals',
  'title: World Capitals',
  '',
  'quiz: spelling.qwiz',
  'id: spelling',
  'title: Spelling Bee',
  'requires: [capitals]',
  '',
  'quiz: finale.qwiz',
  'id: finale',
  'title: Grand Finale',
  'requires: [spelling]',
  ':require_win=true'
].join('\n');

const FILES = {
  '.qwizgroup': MANIFEST,
  'capitals.qwiz': quiz('World Capitals'),
  'spelling.qwiz': quiz('Spelling Bee'),
  'finale.qwiz': quiz('Grand Finale')
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** Plays one journey node to its results screen and returns to the map.
 *
 * Node locators are anchored with `^` throughout this spec: a locked node's hint names the quiz
 * blocking it ("Clear World Capitals to unlock"), so an unanchored /World Capitals/ matches both
 * that node and its own button. */
async function playNode(page: Page, name: string, answer: 'Correct' | 'Wrong') {
  const play = new PlayPage(page);
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();
  await play.choiceOption(answer).click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await page.getByRole('button', { name: 'Back to the journey' }).click();
}

test('a journey locks everything behind its first quiz, then opens step by step', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await expect(page.getByRole('heading', { name: 'The Qwiz Trail', level: 1 })).toBeVisible();
  await expect(page.getByText('0 of 3 cleared')).toBeVisible();

  // Only the entry point is playable; a locked node is a real disabled button, so it stays in the
  // accessibility tree and announces itself rather than being an unclickable div.
  await expect(page.getByRole('button', { name: /^World Capitals/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Spelling Bee/ })).toBeDisabled();
  await expect(page.getByText('Clear World Capitals to unlock')).toBeVisible();

  await playNode(page, 'World Capitals', 'Correct');

  await expect(page.getByText('1 of 3 cleared')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Spelling Bee/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Grand Finale/ })).toBeDisabled();
});

test('progress survives a reload, which is the whole promise of a journey', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await playNode(page, 'World Capitals', 'Correct');
  await expect(page.getByText('1 of 3 cleared')).toBeVisible();

  await page.reload();
  await expect(page.getByText('1 of 3 cleared')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Spelling Bee/ })).toBeEnabled();
});

test('a require_win node needs winning, not just finishing', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await playNode(page, 'World Capitals', 'Correct');
  await playNode(page, 'Spelling Bee', 'Correct');
  await expect(page.getByRole('button', { name: /^Grand Finale/ })).toBeEnabled();

  // Finished but lost: the group's require_win=false made the first two clear on completion, but
  // this entry overrode it, so playing badly leaves it unfinished.
  await playNode(page, 'Grand Finale', 'Wrong');
  await expect(page.getByText('Played — win it to clear it')).toBeVisible();
  await expect(page.getByText('2 of 3 cleared')).toBeVisible();

  await playNode(page, 'Grand Finale', 'Correct');
  await expect(page.getByText('3 of 3 cleared')).toBeVisible();
});

test('a win is sticky, so a worse replay cannot re-lock what it opened', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await playNode(page, 'World Capitals', 'Correct');
  await playNode(page, 'Spelling Bee', 'Correct');
  await playNode(page, 'Grand Finale', 'Correct');
  await expect(page.getByText('3 of 3 cleared')).toBeVisible();

  // Replaying badly must not take the clear away — that would punish curiosity.
  await playNode(page, 'Grand Finale', 'Wrong');
  await expect(page.getByText('3 of 3 cleared')).toBeVisible();
});

test('resetting is a two-step confirm, and actually clears', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await playNode(page, 'World Capitals', 'Correct');
  await expect(page.getByText('1 of 3 cleared')).toBeVisible();

  await page.getByRole('button', { name: 'Reset progress' }).click();
  await page.getByRole('button', { name: 'Confirm reset?' }).click();

  await expect(page.getByText('0 of 3 cleared')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Spelling Bee/ })).toBeDisabled();

  await page.reload();
  await expect(page.getByText('0 of 3 cleared')).toBeVisible();
});

test('playing a journey never adds anything to the library', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await playNode(page, 'World Capitals', 'Correct');
  expect(await storedQuizCount(page)).toBe(0);
});

test('a journey mid-run offers no Play again, only a way back to the map', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  const play = new PlayPage(page);
  await page.getByRole('button', { name: /^World Capitals/ }).click();
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();
  await play.choiceOption('Correct').click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  // Replaying a scored node from inside its own results screen would let a player quietly retake
  // it; the way back is through the map.
  await expect(play.playAgainButton).toBeHidden();
  await expect(page.getByRole('button', { name: 'Back to the journey' })).toBeVisible();
  // Reviewing stays available in both layouts: it reveals, it doesn't re-run.
  await expect(play.reviewAnswersButton).toBeVisible();
});

test('a journey shows no folder tree, because the order is the point', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');

  await expect(page.getByRole('button', { name: 'Expand all' })).toBeHidden();
  await expect(page.getByText('Start')).toBeVisible();
  await expect(page.getByText('Finish')).toBeVisible();
});

test('progress is kept per group, so two journeys never bleed into each other', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await page.goto('/group?repo=owner%2Frepo');
  await playNode(page, 'World Capitals', 'Correct');
  await expect(page.getByText('1 of 3 cleared')).toBeVisible();

  // Same manifest, different repository — a fetched quiz gets a fresh id every load, which is
  // exactly why progress is keyed by repo + manifest entry id instead.
  await stubRepo(page, 'other', 'repo', { files: FILES });
  await page.goto('/group?repo=other%2Frepo');
  await expect(page.getByText('0 of 3 cleared')).toBeVisible();
});
