import { expect, test, type Page } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { stubRepo } from './utils/github';
import { waitForHydration } from './utils/hydration';
import { resetStorage } from './utils/storage';

/** Navigates and waits for the islands to hydrate before anything is clicked.
 *
 * The Back link resolves where it points from the URL, so it is exactly the handler-dependent
 * interaction CLAUDE.md §7 warns about: click it too early and the static `href="/"` wins. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page);
}

/** Clicks Back and waits for the island to hydrate on the page it lands on, so a second Back is
 * safe to click. Every Back is a full navigation, and each one re-renders the island. */
async function clickBack(page: Page) {
  await page.getByRole('link', { name: 'Back' }).click();
  await waitForHydration(page);
}

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

/** A repository with a group nested two folders deep, which is where a breadcrumb starts earning
 * its place and where "Back goes home" was most obviously wrong. */
const FILES = {
  'examples/groups/.qwizgroup': ['---', 'title: Example Groups', ':mode=folders', '---'].join('\n'),
  'examples/groups/journey/.qwizgroup': [
    '---',
    'title: The Qwiz Trail',
    ':mode=folders',
    '---',
    '',
    'quiz: one.qwiz',
    'title: Round One'
  ].join('\n'),
  'examples/groups/journey/one.qwiz': quiz('Round One')
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
  await stubRepo(page, 'owner', 'repo', { files: FILES });
});

test('a nested group shows a breadcrumb of the folders above it', async ({ page }) => {
  await open(page, '/group?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney');

  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'owner/repo' })).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'examples' })).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'groups' })).toBeVisible();
  // The folder you're already in isn't a link — you're there.
  await expect(crumbs.getByText('journey', { exact: true })).toBeVisible();
  await expect(crumbs.getByRole('link', { name: 'journey' })).toBeHidden();
});

test('a breadcrumb link climbs to that exact folder, not the whole path', async ({ page }) => {
  await open(page, '/group?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney');

  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'groups' })
    .click();
  await expect(page).toHaveURL(/path=examples%2Fgroups$/);
});

test('a group at the repository root shows no breadcrumb, because one crumb is a label', async ({
  page
}) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': ['---', 'title: Flat', ':mode=folders', '---'].join('\n'),
      'a.qwiz': quiz('A')
    }
  });
  await open(page, '/group?repo=owner%2Frepo');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeHidden();
});

test('Back climbs one folder rather than jumping to the library', async ({ page }) => {
  await open(page, '/group?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney');

  await clickBack(page);
  await expect(page).toHaveURL(/path=examples%2Fgroups$/);

  await clickBack(page);
  await expect(page).toHaveURL(/path=examples$/);
});

test('Back from a quiz returns to the folder that listed it', async ({ page }) => {
  await open(page, '/group?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney');
  await page.getByRole('link', { name: 'Round One' }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await page.getByRole('link', { name: 'Back' }).click();

  await expect(page).toHaveURL(/\/group\?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney/);
  await expect(page.getByRole('heading', { name: 'The Qwiz Trail' })).toBeVisible();
});

test('Back from a whole-group run returns to that group, toggles and all discarded', async ({
  page
}) => {
  await open(page, '/group/play?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney&merge=1');
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/group\?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney/);
});

test('Back still reaches the library from a group at the repository root', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', {
    files: {
      '.qwizgroup': ['---', 'title: Flat', ':mode=folders', '---'].join('\n'),
      'a.qwiz': quiz('A')
    }
  });

  // Arrived from inside the app, so Back is history — which is the library.
  await page.goto('/');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByLabel('GitHub gist or repository').fill('owner/repo');
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Flat' })).toBeVisible();

  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('a finished run offers no second way out — the header Back is the one', async ({ page }) => {
  await open(page, '/group?repo=owner%2Frepo&path=examples%2Fgroups%2Fjourney');
  await page.getByRole('link', { name: 'Round One' }).click();

  const play = new PlayPage(page);
  await play.startQuizButton.waitFor({ state: 'visible' });
  await play.start();
  await play.choiceOption('Correct').click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  await expect(play.resultHeading()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to quizzes' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Back' })).toBeVisible();
});
