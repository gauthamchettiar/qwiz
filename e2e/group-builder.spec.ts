import { expect, test, type Page } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { HomePage } from './pages/HomePage';
import { resetStorage, seedQuizzes, simulateStorageFull } from './utils/storage';

/** Opens code mode and reads the manifest out of it — the same string the download contains.
 *
 * CodeEditor renders its source into a highlighted `<pre>` layered under the textarea, and
 * `highlightQwiz`'s concatenation invariant (qwizHighlight.ts) guarantees that `<pre>` reproduces
 * its input character for character. So this reads the real document, not a rendering of it.
 * Discards on the way out, leaving the form exactly as it was found. */
async function manifest(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Edit group code' }).click();
  const source = await page.locator('pre').first().innerText();
  await page.getByRole('button', { name: 'Discard changes' }).click();
  return source.trim();
}

/** Adds an entry card per title and picks that quiz in it. */
async function include(page: Page, ...titles: string[]) {
  for (const title of titles) {
    const before = await page.getByRole('combobox', { name: /^Quiz \d+$/ }).count();
    await page.getByRole('button', { name: 'Add quiz' }).click();
    await page.getByRole('combobox', { name: `Quiz ${before + 1}` }).selectOption({ label: title });
  }
}

/** Sets a group-wide `:key=value`. `mode` is seeded, so it's row 1 and already selected. */
async function setSetting(page: Page, key: string, value: string) {
  const keys = page.getByRole('combobox', { name: 'Setting key' });
  const count = await keys.count();
  for (let i = 0; i < count; i += 1) {
    if ((await keys.nth(i).inputValue()) === key) {
      await page.getByPlaceholder('value').nth(i).fill(value);
      return;
    }
  }
  await page.getByRole('button', { name: 'Add setting' }).click();
  await keys.nth(count).selectOption(key);
  await page.getByPlaceholder('value').nth(count).fill(value);
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

test.beforeEach(async ({ page }) => {
  await seedThree(page);
  await page.goto('/local/group');
});

test('the builder is reachable from the header New menu', async ({ page }) => {
  // Through the page object rather than a bare `goto`, because opening the menu needs a click
  // handler and `goto` resolves before the header's islands have run (CLAUDE.md §7).
  const home = new HomePage(page);
  await home.goto();
  await home.openNewGroup();
  await expect(page).toHaveURL(/\/local\/group/);
  await expect(page.getByRole('heading', { name: 'Generate a Group', level: 1 })).toBeVisible();
});

test('a folders group builds a manifest naming every quiz picked', async ({ page }) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals', 'Spelling Bee');

  const source = await manifest(page);
  expect(source).toContain('title: Thursday Night Quiz');
  expect(source).toContain(':mode=folders');
  expect(source).toContain('quiz: world-capitals.qwiz');
  expect(source).toContain('quiz: spelling-bee.qwiz');
  await expect(page.getByText('3 files')).toBeVisible(); // manifest + two quizzes
});

test('a group starts in folders mode with the key already on screen', async ({ page }) => {
  await expect(page.getByRole('combobox', { name: 'Setting key' })).toHaveValue('mode');
  await expect(page.getByPlaceholder('value')).toHaveValue('folders');
  await expect(page.getByText('Players browse a folder tree')).toBeVisible();
});

test('the download is refused until the group is actually valid', async ({ page }) => {
  const download = page.getByRole('button', { name: /Download \.zip/ });

  // Nothing picked and no title.
  await expect(download).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(/at least one quiz/);

  await include(page, 'World Capitals');
  await expect(page.getByRole('alert')).toContainText(/a title/);
  await expect(download).toBeDisabled();

  await page.getByLabel('Title').fill('My Group');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(download).toBeEnabled();
});

test('an entry card with no quiz chosen is refused rather than skipped', async ({ page }) => {
  await page.getByLabel('Title').fill('My Group');
  await include(page, 'World Capitals');
  await page.getByRole('button', { name: 'Add quiz' }).click();

  await expect(page.getByRole('alert')).toContainText(/Every entry needs a quiz/);
  await expect(page.getByRole('button', { name: /Download \.zip/ })).toBeDisabled();

  await page.getByRole('combobox', { name: 'Quiz 2' }).selectOption({ label: 'Spelling Bee' });
  await expect(page.getByRole('alert')).toBeHidden();
});

test('an entry can be removed again', async ({ page }) => {
  await page.getByLabel('Title').fill('My Group');
  await include(page, 'World Capitals', 'Spelling Bee');

  await page.getByRole('button', { name: 'Remove Spelling Bee' }).click();
  await expect(page.getByRole('combobox', { name: /^Quiz \d+$/ })).toHaveCount(1);
  expect(await manifest(page)).not.toContain('spelling-bee.qwiz');
});

test('a journey chains its quizzes in the order shown, and writes explicit ids', async ({
  page
}) => {
  await page.getByLabel('Title').fill('The Trail');
  await setSetting(page, 'mode', 'journey');
  await include(page, 'World Capitals', 'Spelling Bee');

  const source = await manifest(page);
  // Explicit ids are required in journey mode; a manifest without them wouldn't parse.
  expect(source).toContain('id: world-capitals');
  expect(source).toContain('requires: [world-capitals]');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('reordering a journey reorders what unlocks what', async ({ page }) => {
  await page.getByLabel('Title').fill('The Trail');
  await setSetting(page, 'mode', 'journey');
  await include(page, 'World Capitals', 'Spelling Bee');

  await page.getByRole('button', { name: 'Move Spelling Bee up' }).click();
  expect(await manifest(page)).toContain('requires: [spelling-bee]');
});

test('a gauntlet insists on categories, because that is what the mode is', async ({ page }) => {
  await page.getByLabel('Title').fill('The Gauntlet');
  await setSetting(page, 'mode', 'gauntlet');
  await include(page, 'World Capitals', 'Spelling Bee');

  await expect(page.getByRole('alert')).toContainText(/category folder/);
  await expect(page.getByRole('button', { name: /Download \.zip/ })).toBeDisabled();

  await page.getByLabel('Folder for World Capitals').fill('geography');
  await page.getByLabel('Folder for Spelling Bee').fill('language');

  await expect(page.getByRole('alert')).toBeHidden();
  expect(await manifest(page)).toContain('quiz: geography/world-capitals.qwiz');
});

test('a gauntlet with only one category is refused', async ({ page }) => {
  await page.getByLabel('Title').fill('The Gauntlet');
  await setSetting(page, 'mode', 'gauntlet');
  await include(page, 'World Capitals', 'Spelling Bee');
  await page.getByLabel('Folder for World Capitals').fill('geography');
  await page.getByLabel('Folder for Spelling Bee').fill('geography');

  await expect(page.getByRole('alert')).toContainText(/at least two categories/);
});

test('a setting written under a mode with no use for it is reported, not dropped', async ({
  page
}) => {
  // The reason the builder no longer filters settings by mode: the round-trip through the real
  // parser already says exactly this, and filtering was hiding it.
  await page.getByLabel('Title').fill('My Group');
  await include(page, 'World Capitals');
  await setSetting(page, 'rounds', '5');

  await expect(page.getByRole('alert')).toContainText(/"rounds" only applies to gauntlet/);
  await expect(page.getByRole('button', { name: /Download \.zip/ })).toBeDisabled();
});

test('folder inputs are hidden for modes that ignore where a file sits', async ({ page }) => {
  await include(page, 'World Capitals');
  await expect(page.getByLabel('Folder for World Capitals')).toBeVisible();

  await setSetting(page, 'mode', 'merge');
  await expect(page.getByLabel('Folder for World Capitals')).toBeHidden();
  // The display-name override still applies everywhere.
  await expect(page.getByLabel('Display name for World Capitals')).toBeVisible();
});

test('the source editor replaces the form, and applying feeds the edit back into it', async ({
  page
}) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals');

  await page.getByRole('button', { name: 'Edit group code' }).click();
  // Two editable copies of one group is the thing this avoids.
  await expect(page.getByLabel('Title')).toBeHidden();
  await expect(page.getByRole('combobox', { name: 'Quiz 1' })).toBeHidden();

  const editor = page.getByRole('textbox', { name: 'Group .qwizgroup source' });
  await editor.fill(
    [
      '---',
      'title: Renamed In Source',
      'description: Edited by hand.',
      ':mode=folders',
      '---',
      '',
      'quiz: week-1/world-capitals.qwiz'
    ].join('\n')
  );
  await page.getByRole('button', { name: 'Apply changes' }).click();

  await expect(page.getByLabel('Title')).toHaveValue('Renamed In Source');
  await expect(page.getByLabel('Description')).toHaveValue('Edited by hand.');
  // The stem is what resolves the entry, so a quiz moved to a folder follows rather than vanishing.
  await expect(page.getByLabel('Folder for World Capitals')).toHaveValue('week-1');
});

test('an unparseable manifest keeps the editor open with its errors showing', async ({ page }) => {
  await page.getByLabel('Title').fill('My Group');
  await include(page, 'World Capitals');

  await page.getByRole('button', { name: 'Edit group code' }).click();
  await page
    .getByRole('textbox', { name: 'Group .qwizgroup source' })
    .fill(
      ['---', 'title: Broken', ':nonsense=true', '---', '', 'quiz: world-capitals.qwiz'].join('\n')
    );

  await expect(page.getByRole('alert')).toContainText(/nonsense/);
  await page.getByRole('button', { name: 'Apply changes' }).click();
  // Still in the editor: applying a document that can't be read would lose it.
  await expect(page.getByRole('textbox', { name: 'Group .qwizgroup source' })).toBeVisible();

  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('My Group');
});

test('a quiz path naming nothing in the library is reported, not silently dropped', async ({
  page
}) => {
  await page.getByLabel('Title').fill('My Group');
  await include(page, 'World Capitals');

  await page.getByRole('button', { name: 'Edit group code' }).click();
  await page
    .getByRole('textbox', { name: 'Group .qwizgroup source' })
    .fill(['---', 'title: My Group', ':mode=folders', '---', '', 'quiz: nowhere.qwiz'].join('\n'));
  await page.getByRole('button', { name: 'Apply changes' }).click();

  await expect(page.getByRole('alert')).toContainText(/nowhere\.qwiz/);
  await expect(page.getByRole('textbox', { name: 'Group .qwizgroup source' })).toBeVisible();
});

test('the same quiz added twice becomes two files, not one', async ({ page }) => {
  await page.getByLabel('Title').fill('Twice Round');
  await include(page, 'World Capitals', 'World Capitals');

  const source = await manifest(page);
  expect(source).toContain('quiz: world-capitals.qwiz');
  expect(source).toContain('quiz: world-capitals-2.qwiz');
  await expect(page.getByText('3 files')).toBeVisible();
});

test('downloading produces a .zip named after the group', async ({ page }) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals', 'Spelling Bee');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download \.zip/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('thursday-night-quiz.zip');
});

test('the empty library says what to do instead of offering a broken form', async ({ page }) => {
  await resetStorage(page);
  await page.goto('/local/group');
  await expect(page.getByText(/No quizzes yet/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Download \.zip/ })).toBeHidden();
  // Nothing to play either, so the header's Play goes with it.
  await expect(page.getByRole('button', { name: 'Play' })).toBeHidden();
});

test('a group can be saved to this browser and reopened for editing', async ({ page }) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await page.getByLabel('Description').fill('Three rounds, one winner.');
  await include(page, 'World Capitals', 'Spelling Bee');

  await page.getByRole('button', { name: 'Save to this browser' }).click();
  // A brand-new group's first save moves it to its real address, the way a new quiz does.
  await expect(page).toHaveURL(/\/local\/group\?id=/);
  await expect(page.getByRole('heading', { name: 'Edit a Group', level: 1 })).toBeVisible();

  await page.goto('/');
  const card = page.getByRole('link', { name: /Thursday Night Quiz/ });
  await expect(card).toBeVisible();
  await expect(page.getByText('built here')).toBeVisible();
  await expect(page.getByText('2 quizzes')).toBeVisible();

  // Named exactly: quiz cards carry an "Actions for …" menu too.
  await page.getByRole('button', { name: 'Actions for "Thursday Night Quiz"' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();

  await expect(page.getByLabel('Title')).toHaveValue('Thursday Night Quiz');
  await expect(page.getByLabel('Description')).toHaveValue('Three rounds, one winner.');
  await expect(page.getByRole('combobox', { name: /^Quiz \d+$/ })).toHaveCount(2);
});

test('re-saving an edited group updates it in place rather than adding a second', async ({
  page
}) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals');
  await page.getByRole('button', { name: 'Save to this browser' }).click();
  await expect(page).toHaveURL(/\/local\/group\?id=/);

  await page.getByLabel('Title').fill('Friday Night Quiz');
  await page.getByRole('button', { name: 'Save to this browser' }).click();
  // Already at its own address, so it stays put and confirms inline.
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: /Friday Night Quiz/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Thursday Night Quiz/ })).toBeHidden();
});

test('a group whose quiz has since been deleted still opens, and says what is missing', async ({
  page
}) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals', 'Spelling Bee');
  await page.getByRole('button', { name: 'Save to this browser' }).click();
  await expect(page).toHaveURL(/\/local\/group\?id=/);
  const url = page.url();

  // Drop one of the quizzes the group names out of the library.
  await page.goto('/');
  await seedQuizzes(page, [buildQuiz({ title: 'World Capitals' })]);

  await page.goto(url);
  // Reported, not silently dropped — and the rest of the group is still editable.
  await expect(page.getByText(/spelling-bee\.qwiz/)).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Thursday Night Quiz');
  await expect(page.getByRole('combobox', { name: /^Quiz \d+$/ })).toHaveCount(1);
});

test('a save that cannot be written is reported rather than claimed', async ({ page }) => {
  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals');
  await simulateStorageFull(page);
  await page.reload();

  await page.getByLabel('Title').fill('Thursday Night Quiz');
  await include(page, 'World Capitals');
  await page.getByRole('button', { name: 'Save to this browser' }).click();

  await expect(page.getByRole('alert')).toContainText(/too large|unavailable/);
  await expect(page).not.toHaveURL(/id=/);
});
