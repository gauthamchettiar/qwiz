import { expect, test, type Page } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { resetStorage, seedQuizzes } from './utils/storage';

/** Reads the manifest out of the live preview, which is the same string the download contains. */
async function manifest(page: Page): Promise<string> {
  return (await page.locator('pre').first().innerText()).trim();
}

async function seedThree(page: Page) {
  await page.goto('/');
  await resetStorage(page);
  await seedQuizzes(page, [
    buildQuiz({ title: 'World Capitals' }),
    buildQuiz({ title: 'Spelling Bee' }),
    buildQuiz({ title: 'Grand Finale' })
  ]);
}

async function include(page: Page, ...titles: string[]) {
  for (const title of titles) {
    await page.getByRole('listitem').filter({ hasText: title }).getByRole('checkbox').check();
  }
}

test.beforeEach(async ({ page }) => {
  await seedThree(page);
  await page.goto('/local/group');
});

test('the builder is reachable from the quiz list', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Publish a group' }).click();
  await expect(page).toHaveURL(/\/local\/group/);
  await expect(page.getByRole('heading', { name: 'Publish a group', level: 1 })).toBeVisible();
});

test('a folders group builds a manifest naming every quiz picked', async ({ page }) => {
  await page.getByLabel('Group title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals', 'Spelling Bee');

  const source = await manifest(page);
  expect(source).toContain('title: Thursday Night Quiz');
  expect(source).toContain(':mode=folders');
  expect(source).toContain('quiz: world-capitals.qwiz');
  expect(source).toContain('quiz: spelling-bee.qwiz');
  await expect(page.getByText('3 files')).toBeVisible(); // manifest + two quizzes
});

test('the download is refused until the group is actually valid', async ({ page }) => {
  const download = page.getByRole('button', { name: /Download group/ });

  // Nothing picked and no title.
  await expect(download).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(/at least one quiz/);

  await include(page, 'World Capitals');
  await expect(page.getByRole('alert')).toContainText(/a title/);
  await expect(download).toBeDisabled();

  await page.getByLabel('Group title').fill('My Group');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(download).toBeEnabled();
});

test('a journey chains its quizzes in the order shown, and writes explicit ids', async ({
  page
}) => {
  await page.getByLabel('Group title').fill('The Trail');
  await page.getByLabel('How it plays').selectOption('journey');
  await include(page, 'World Capitals', 'Spelling Bee');

  const source = await manifest(page);
  // Explicit ids are required in journey mode; a manifest without them wouldn't parse.
  expect(source).toContain('id: world-capitals');
  expect(source).toContain('requires: [world-capitals]');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('reordering a journey reorders what unlocks what', async ({ page }) => {
  await page.getByLabel('Group title').fill('The Trail');
  await page.getByLabel('How it plays').selectOption('journey');
  await include(page, 'World Capitals', 'Spelling Bee');

  await page.getByRole('button', { name: 'Move Spelling Bee up' }).click();
  expect(await manifest(page)).toContain('requires: [spelling-bee]');
});

test('a gauntlet insists on categories, because that is what the mode is', async ({ page }) => {
  await page.getByLabel('Group title').fill('The Gauntlet');
  await page.getByLabel('How it plays').selectOption('gauntlet');
  await include(page, 'World Capitals', 'Spelling Bee');

  await expect(page.getByRole('alert')).toContainText(/category folder/);
  await expect(page.getByRole('button', { name: /Download group/ })).toBeDisabled();

  await page.getByLabel('Folder for World Capitals').fill('geography');
  await page.getByLabel('Folder for Spelling Bee').fill('language');

  await expect(page.getByRole('alert')).toBeHidden();
  expect(await manifest(page)).toContain('quiz: geography/world-capitals.qwiz');
});

test('a gauntlet with only one category is refused', async ({ page }) => {
  await page.getByLabel('Group title').fill('The Gauntlet');
  await page.getByLabel('How it plays').selectOption('gauntlet');
  await include(page, 'World Capitals', 'Spelling Bee');
  await page.getByLabel('Folder for World Capitals').fill('geography');
  await page.getByLabel('Folder for Spelling Bee').fill('geography');

  await expect(page.getByRole('alert')).toContainText(/at least two categories/);
});

test('mode-specific settings only appear for the mode that accepts them', async ({ page }) => {
  const requireWin = page.getByText('Each quiz must be won');
  const rounds = page.getByLabel('Rounds');

  await expect(requireWin).toBeHidden();
  await page.getByLabel('How it plays').selectOption('journey');
  await expect(requireWin).toBeVisible();
  await expect(rounds).toBeHidden();

  await page.getByLabel('How it plays').selectOption('gauntlet');
  await expect(requireWin).toBeHidden();
  await expect(rounds).toBeVisible();
});

test('folder inputs are hidden for modes that ignore where a file sits', async ({ page }) => {
  await include(page, 'World Capitals');
  await expect(page.getByLabel('Folder for World Capitals')).toBeVisible();

  await page.getByLabel('How it plays').selectOption('merge');
  await expect(page.getByLabel('Folder for World Capitals')).toBeHidden();
  // The display-name override still applies everywhere.
  await expect(page.getByLabel('Display name for World Capitals')).toBeVisible();
});

test('downloading produces a .zip named after the group', async ({ page }) => {
  await page.getByLabel('Group title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals', 'Spelling Bee');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download group/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('thursday-night-quiz.zip');
});

test('the empty library says what to do instead of offering a broken form', async ({ page }) => {
  await resetStorage(page);
  await page.goto('/local/group');
  await expect(page.getByText(/No quizzes yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Download group/ })).toBeHidden();
});
