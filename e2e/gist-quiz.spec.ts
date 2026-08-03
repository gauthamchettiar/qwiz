import { expect, test } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { HomePage } from './pages/HomePage';
import { stubGist } from './utils/github';
import { resetStorage, simulateStorageFull, storedQuizCount } from './utils/storage';

const GIST_ID = 'aa5f1c1b8d0d0a3e0e6e9c9a0b1c2d3e';

const CAPITALS = [
  '---',
  'title: Gist Capitals',
  'description: Published as a gist.',
  'category: geography',
  'tags: [gist]',
  ':shuffle_questions=false',
  '---',
  '',
  'What is the capital of France?',
  '{',
  '=Paris',
  '~Lyon',
  '}'
].join('\n');

const FLAGS = [
  '---',
  'title: Gist Flags',
  'description: A second quiz in the same gist.',
  ':shuffle_questions=false',
  '---',
  '',
  'Which flag is red and white?',
  '{',
  '=Canada',
  '~Brazil',
  '}'
].join('\n');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('a gist link plays the quiz without putting it in the library', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS, 'README.md': '# notes' } });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  // The welcome screen is the same one every run gets — a gist is another way in, not another mode.
  await expect(page.getByRole('heading', { name: 'Gist Capitals', level: 1 })).toBeVisible();
  await expect(play.rulesHeading).toBeVisible();

  await play.start();
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  // Played end to end and still nothing was written. A UI check can't tell "not persisted" from
  // "persisted but not shown", which is why this reads storage directly.
  expect(await storedQuizCount(page)).toBe(0);
});

test('a whole gist URL works as well as a bare id', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS } });

  const play = new PlayPage(page);
  const pasted = encodeURIComponent(`https://gist.github.com/someone/${GIST_ID}`);
  await play.gotoRemote(`/play?gist=${pasted}`, { start: false });

  await expect(page.getByRole('heading', { name: 'Gist Capitals', level: 1 })).toBeVisible();
});

test('a gist with several quizzes asks which one rather than guessing', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS, 'flags.qwiz': FLAGS } });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await expect(play.gistFilePicker()).toBeVisible();
  await expect(play.startQuizButton).toBeHidden();

  await page.getByRole('button', { name: 'flags.qwiz' }).click();
  await expect(page.getByRole('heading', { name: 'Gist Flags', level: 1 })).toBeVisible();
});

test('naming a file in the link skips the picker', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS, 'flags.qwiz': FLAGS } });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}&file=flags.qwiz`, { start: false });

  await expect(play.gistFilePicker()).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Gist Flags', level: 1 })).toBeVisible();
});

test('Save a copy adds the gist quiz to the library, and it survives a reload', async ({
  page
}) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS } });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('button', { name: 'Saved to your quizzes' })).toBeDisabled();
  expect(await storedQuizCount(page)).toBe(1);

  const home = new HomePage(page);
  await home.goto();
  await home.expectListed('Gist Capitals');
});

test('Save a copy surfaces a storage failure instead of claiming success', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'capitals.qwiz': CAPITALS } });
  await simulateStorageFull(page);

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('alert')).toContainText(/storage/i);
  await expect(page.getByRole('button', { name: 'Saved to your quizzes' })).toBeHidden();
});

test('a gist holding no .qwiz file says so', async ({ page }) => {
  await stubGist(page, GIST_ID, { files: { 'notes.md': '# just notes' } });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await expect(page.getByRole('alert')).toContainText(/doesn't contain a \.qwiz file/);
  await expect(page.getByRole('link', { name: 'Go to your own quizzes' })).toBeVisible();
});

test('a gist whose quiz does not parse reports the parse errors, not a blank screen', async ({
  page
}) => {
  await stubGist(page, GIST_ID, {
    files: { 'broken.qwiz': '---\ntitle: Broken\n---\n\npick_one: No options here' }
  });

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await expect(page.getByRole('alert')).toContainText(/no options/i);
  await expect(play.startQuizButton).toBeHidden();
});
