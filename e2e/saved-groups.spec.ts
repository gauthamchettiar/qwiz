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
  await page.getByRole('button', { name: 'Save to Browser' }).click();
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
  await expect(page.getByText('offline copy')).toBeVisible();
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

  await page.getByRole('button', { name: /^Remove/ }).click();
  await page.getByRole('button', { name: 'Confirm?' }).click();
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toBeHidden();
  await expect(page.getByText(/No saved groups/)).toBeVisible();
});

test('reopening a saved group offers to update rather than to save again', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  await saveTheGroup(page);

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByText('Saved to this browser')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to Browser' })).toBeHidden();
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

test('the empty Saved Groups section says how to fill it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/No saved groups/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Generate a Group' })).toBeVisible();
});

test('a gist has no group to save, so the action never appears there', async ({ page }) => {
  await stubGist(page, 'aa5f1c1b', { files: { 'a.qwiz': quiz('A gist quiz') } });

  const play = new PlayPage(page);
  await play.gotoRemote('/play?gist=aa5f1c1b', { start: false });
  await expect(page.getByRole('button', { name: 'Save to Browser' })).toBeHidden();
  // The per-quiz equivalent is still there.
  await expect(page.getByRole('button', { name: 'Save a copy' })).toBeVisible();
});
