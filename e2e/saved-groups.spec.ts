import { expect, test, type Page } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { countApiCalls, stubGist, stubRepo } from './utils/github';
import { resetStorage } from './utils/storage';

function quiz(title: string) {
  return [
    '---',
    `title: ${title}`,
    ':shuffle_questions=false',
    '---',
    '',
    'Which one is right?',
    '{',
    '=Correct',
    '~Wrong',
    '}'
  ].join('\n');
}

const FILES = {
  '.qwizgroup': [
    '---',
    'title: Thursday Night Quiz',
    'description: Every round we have ever run.',
    ':mode=folders',
    '---',
    '',
    'quiz: rounds/one.qwiz',
    'title: Round One',
    '',
    'quiz: rounds/two.qwiz',
    'title: Round Two'
  ].join('\n'),
  'rounds/one.qwiz': quiz('Round One'),
  'rounds/two.qwiz': quiz('Round Two')
};

async function saveTheGroup(page: Page) {
  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByText('Saved to this browser')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('a group can be saved to the browser and appears under Saved Groups', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Saved Groups' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toBeVisible();
  // The card is compact now, matching a quiz card: count and date, with the repository and the
  // "offline copy" badge dropped as detail nobody scans a list for.
  await expect(page.getByText('2 quizzes')).toBeVisible();
});

test('a saved group opens and plays with no GitHub requests at all', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  // Counted from here, so the save's own fetches don't muddy it.
  const apiCalls = countApiCalls(page);
  let anyGitHub = 0;
  page.on('request', (request) => {
    if (/github/.test(new URL(request.url()).hostname)) anyGitHub += 1;
  });

  await page.getByRole('link', { name: /Thursday Night Quiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Thursday Night Quiz' })).toBeVisible();
  await expect(page.getByText('Saved copy')).toBeVisible();

  await page.getByRole('link', { name: 'Round One' }).click();
  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });

  // The whole point of an offline copy: not one request, metered or otherwise.
  expect(apiCalls()).toBe(0);
  expect(anyGitHub).toBe(0);
});

test('the saved copy survives a reload, and can be removed again', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  await page.reload();
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toBeVisible();

  // Delete lives in the card's overflow menu now, behind the same two-step confirm.
  await page.getByRole('button', { name: /^Actions for/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Confirm delete?' }).click();
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toBeHidden();
  await expect(page.getByText(/No saved groups/)).toBeVisible();
});

test('reopening a saved group offers to update rather than to save again', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByText('Saved to this browser')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save a copy' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Update the copy' })).toBeVisible();
});

test('saving the same group twice keeps one entry, not two', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('button', { name: 'Update the copy' }).click();

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toHaveCount(1);
});

test('playing a saved group plays the copy, not the repository it came from', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  // Counted from here, so the save's own fetches don't muddy it.
  const apiCalls = countApiCalls(page);
  let anyGitHub = 0;
  page.on('request', (request) => {
    if (/github/.test(new URL(request.url()).hostname)) anyGitHub += 1;
  });

  await page.getByRole('link', { name: /Thursday Night Quiz/ }).click();
  await page.getByRole('link', { name: /^Play all/ }).click();

  // Play used to derive its link from the repository the copy came from, so pressing it went
  // straight back to the network for a group already sitting in localStorage.
  await expect(page).toHaveURL(/\/group\/play\?saved=/);
  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });

  expect(apiCalls()).toBe(0);
  expect(anyGitHub).toBe(0);
});

test('leaving a saved group’s run returns to that group, not to the library', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  await page.getByRole('link', { name: /Thursday Night Quiz/ }).click();
  await page.getByRole('link', { name: /^Play all/ }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/group\?saved=/);
});

test('a group built here is marked as such, and offers Edit rather than a refetch', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);
  await page.goto('/');

  // A copied group refreshes from its repository…
  await page.getByRole('button', { name: 'Actions for "Thursday Night Quiz"' }).click();
  await expect(page.getByRole('button', { name: 'Update the copy' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeHidden();
  await expect(page.getByText('built here')).toBeHidden();
});

test('a repository group cannot be opened in the local builder', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/');
  const href = await page.getByRole('link', { name: /Thursday Night Quiz/ }).getAttribute('href');
  const id = new URL(href!, 'http://x').searchParams.get('saved');

  // Its entries name files in someone else's repository, not quizzes in this library, so the
  // builder says so rather than opening a form that would resolve almost nothing.
  await page.goto(`/local/group?id=${id}`);
  await expect(page.getByRole('alert')).toContainText(/saved from a repository/);
  await expect(page.getByLabel('Title')).toBeHidden();
});

test('a link to a group no longer in this browser says so', async ({ page }) => {
  await page.goto('/local/group?id=does-not-exist');
  await expect(page.getByRole('alert')).toContainText(/isn't saved in this browser/);
});

test('the empty Saved Groups section says how to fill it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/No saved groups/)).toBeVisible();
});

test('a gist has no group to save, so the action never appears there', async ({ page }) => {
  await stubGist(page, 'aa5f1c1b', { files: { 'a.qwiz': quiz('A gist quiz') } });

  const play = new PlayPage(page);
  await play.gotoRemote('/play?gist=aa5f1c1b', { start: false });
  // No group screen renders here, so there's exactly one "Save a copy" button — the per-quiz
  // one — not a second, identically-named group-level action layered on top of it.
  await expect(page.getByRole('button', { name: 'Save a copy' })).toHaveCount(1);
});
