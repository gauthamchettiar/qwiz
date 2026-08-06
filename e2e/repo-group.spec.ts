import { expect, test } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { countApiCalls, stubRepo } from './utils/github';
import { waitForHydration } from './utils/hydration';
import { resetStorage, storedQuizCount } from './utils/storage';

function quiz(title: string, question = 'What is the capital of France?') {
  return [
    '---',
    `title: ${title}`,
    ':shuffle_questions=false',
    '---',
    '',
    question,
    '{',
    '=Paris',
    '~Lyon',
    '}'
  ].join('\n');
}

const MANIFEST = [
  '---',
  'title: The Pub Quiz Library',
  'description: Every round we have ever run.',
  ':mode=folders',
  '---',
  '',
  'quiz: rounds/one.qwiz',
  'title: The Opening Round',
  '',
  'quiz: rounds/two.qwiz',
  '',
  'quiz: finals/decider.qwiz'
].join('\n');

const FILES = {
  '.qwizgroup': MANIFEST,
  'rounds/one.qwiz': quiz('Round One'),
  'rounds/two.qwiz': quiz('Round Two'),
  'finals/decider.qwiz': quiz('The Decider'),
  'README.md': '# not a quiz'
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // `goto` resolves on `load`, before the header's islands have run — so the Import tests below,
  // which click a button rather than just filling a field, would otherwise land on an element with
  // no handler attached yet and silently do nothing (CLAUDE.md §7). The page objects' own `goto*`
  // methods all do this; a bare `page.goto` in a spec has to do it itself.
  await waitForHydration(page);
  await resetStorage(page);
});

test('a repo group lists its quizzes as a browsable tree', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('heading', { name: 'The Pub Quiz Library', level: 1 })).toBeVisible();
  await expect(page.getByText('Every round we have ever run.')).toBeVisible();

  // Folders are open by default — a collapsed list of folder names shows nothing of the group.
  await expect(page.getByRole('link', { name: 'The Opening Round' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'two' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'decider' })).toBeVisible();

  // The manifest's `title:` is what lets the list render without fetching all three quizzes.
  await expect(page.getByText('3 quizzes')).toBeVisible();
});

test('a manifest-listed group costs no GitHub API calls at all', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });
  const apiCalls = countApiCalls(page);

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('heading', { name: 'The Pub Quiz Library' })).toBeVisible();

  // The feature's headline claim: publishing a .qwizgroup keeps a group entirely off the
  // rate-limited API, so a busy shared IP can still open it.
  expect(apiCalls()).toBe(0);
});

test('a quiz opens from the group and plays, without being saved', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'The Opening Round' }).click();

  const play = new PlayPage(page);
  await expect(page).toHaveURL(/\/play\?repo=/);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await expect(page.getByRole('heading', { name: 'Round One', level: 1 })).toBeVisible();

  await play.start();
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  expect(await storedQuizCount(page)).toBe(0);
});

test('folders collapse and expand, and the state survives interaction', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });

  await page.goto('/group?repo=owner%2Frepo');
  const roundsFolder = page.getByRole('button', { name: /^rounds/ });
  await expect(roundsFolder).toHaveAttribute('aria-expanded', 'true');

  await roundsFolder.click();
  await expect(roundsFolder).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: 'The Opening Round' })).toBeHidden();

  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('link', { name: 'The Opening Round' })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('link', { name: 'The Opening Round' })).toBeHidden();
});

test('a repo with no manifest is still browsable, and says so', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { 'rounds/one.qwiz': quiz('Round One'), 'README.md': '# hi' }
  });
  const apiCalls = countApiCalls(page);

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('heading', { name: 'owner/repo', level: 1 })).toBeVisible();
  await expect(page.getByText(/no \.qwizgroup here yet/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'one' })).toBeVisible();

  // The cost of not having a manifest, and the reason to write one: exactly one metered call.
  expect(apiCalls()).toBe(1);
});

test('a nested group is offered as its own screen rather than flattened in', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      'top.qwiz': quiz('Top Level'),
      'extra/.qwizgroup': ['---', 'title: Extra Rounds', '---', '', 'quiz: four.qwiz'].join('\n'),
      'extra/four.qwiz': quiz('Round Four')
    }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await page.getByRole('link', { name: 'extra' }).click();

  await expect(page).toHaveURL(/\/group\?repo=owner%2Frepo&path=extra/);
  await expect(page.getByRole('heading', { name: 'Extra Rounds', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'four' })).toBeVisible();
});

test('a broken manifest reports its parse errors rather than degrading silently', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': ['---', ':mode=carousel', '---', '', 'quiz: a.qwiz'].join('\n'),
      'a.qwiz': quiz('A')
    }
  });

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('alert')).toContainText(/\.qwizgroup file has/);
  await expect(page.getByRole('alert')).toContainText(/must be one of/);
});

test('a repo with no quizzes in it says so instead of rendering an empty tree', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', { files: { 'README.md': '# nothing here' } });

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByRole('alert')).toContainText(/doesn't contain any \.qwiz files/);
  await expect(page.getByRole('link', { name: 'Go to your own quizzes' })).toBeVisible();
});

test('a truncated tree warns rather than showing a quietly partial list', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: { 'one.qwiz': quiz('One') },
    truncated: true
  });

  await page.goto('/group?repo=owner%2Frepo');
  await expect(page.getByText(/too large for Qwiz to scan/)).toBeVisible();
  // Still renders what it did get.
  await expect(page.getByRole('link', { name: 'one' })).toBeVisible();
});

test('the group can be opened from the import dialog', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: FILES });

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('GitHub gist or repository').fill('owner/repo');
  await page.getByRole('button', { name: 'Open' }).click();

  await expect(page).toHaveURL(/\/group\?repo=owner%2Frepo/);
  await expect(page.getByRole('heading', { name: 'The Pub Quiz Library' })).toBeVisible();
});

test('the import dialog rejects something that is neither a gist nor a repo', async ({ page }) => {
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('GitHub gist or repository').fill('this is not a repo');
  await page.getByRole('button', { name: 'Open' }).click();

  await expect(page.getByRole('alert')).toContainText(/doesn't look like a GitHub gist/);
});

test('the import dialog links to the example groups, and they load', async ({ page }) => {
  // The link points at Qwiz's own repository, so the fixture mirrors what examples/groups/ really
  // contains: a hub with no entries of its own (which is what makes the app discover the mode
  // folders below it) and one sub-group per mode.
  await stubRepo(page, 'gauthamchettiar', 'qwiz', {
    files: {
      'examples/groups/.qwizgroup': [
        '---',
        'title: Qwiz Example Groups',
        'description: One folder for each way a set of quizzes can be grouped.',
        ':mode=folders',
        '---'
      ].join('\n'),
      'examples/groups/journey/.qwizgroup': [
        '---',
        'title: The Qwiz Trail',
        ':mode=journey',
        '---',
        '',
        'quiz: world-capitals.qwiz',
        'id: capitals'
      ].join('\n'),
      'examples/groups/journey/world-capitals.qwiz': quiz('World Capitals'),
      'examples/groups/merge/.qwizgroup': [
        '---',
        'title: Science Revision Exam',
        ':mode=merge',
        '---',
        '',
        'quiz: biology.qwiz'
      ].join('\n'),
      'examples/groups/merge/biology.qwiz': quiz('Biology')
    }
  });

  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('link', { name: 'Open the example groups' }).click();

  await expect(page).toHaveURL(/\/group\?repo=gauthamchettiar%2Fqwiz&path=examples%2Fgroups/);
  await expect(page.getByRole('heading', { name: 'Qwiz Example Groups' })).toBeVisible();

  // The hub lists the mode folders as their own screens rather than flattening every quiz in.
  await expect(page.getByRole('link', { name: 'journey' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'merge' })).toBeVisible();

  await page.getByRole('link', { name: 'journey' }).click();
  await expect(page.getByRole('heading', { name: 'The Qwiz Trail' })).toBeVisible();
});
