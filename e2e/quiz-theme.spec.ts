import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage, seedQuizzes } from './utils/storage';

/** A quiz's own look, end to end.
 *
 * Two things are being protected here that unit tests structurally cannot reach. The first is that
 * a preset's stylesheet actually lands on the rendered page — every bug in this feature so far has
 * been a cascade problem, invisible to anything that only inspects strings. The second is the
 * trust boundary: a quiz from outside must not run its author's CSS until someone says so, and
 * asserting that from the DOM is the only way to know it holds.
 *
 * Colours are read from computed style rather than compared as screenshots: the question is "did
 * the theme apply", not "does it look pixel-identical", and a screenshot test would fail on every
 * deliberate palette change.
 */

const ARCADE_PANEL = 'rgb(59, 45, 122)';
const ARCADE_SURFACE = 'rgb(42, 31, 94)';
const AUTHOR_INK = 'rgb(1, 2, 3)';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('a quiz with a preset plays in it, and the app theme picker steps aside', async ({ page }) => {
  const quiz = buildQuiz({ themePreset: 'arcade', themeTrust: 'full' });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // The preset is on the page, not merely in a stylesheet somewhere.
  await expect(page.locator('.qwiz-option').first()).toHaveCSS('background-color', ARCADE_PANEL);

  // The header picker sets the same properties the quiz's stylesheet does, so it removes itself
  // rather than offering a control that would fight the author.
  await expect(page.getByRole('button', { name: /^Theme:/ })).toHaveCount(0);
});

test('an unthemed quiz keeps the visitor’s own theme and their picker', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('qwiz:theme', 'nord'));
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByRole('button', { name: /^Theme:/ })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'nord');
});

test('nothing of the visitor’s own theme bleeds into a themed run, and it returns on leaving', async ({
  page
}) => {
  // The bug this guards: a preset only overrides what it names, so left on the visitor's own
  // theme every unstyled corner would differ per player and the same quiz would look different
  // for everyone.
  await page.evaluate(() => localStorage.setItem('qwiz:theme', 'dracula'));
  const quiz = buildQuiz({ themePreset: 'arcade', themeTrust: 'full' });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'quiz');

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  await expect(page.getByRole('button', { name: /^Theme:/ })).toBeVisible();
});

test('hovering an option never hides its text', async ({ page }) => {
  // Regression: nothing defined hover, so Tailwind's `hover:bg-surface` won and resolved to the
  // light theme's near-white — hovering an option on any dark preset turned it white under white
  // text. Asserting the colour CHANGES and isn't the page's near-white is enough to catch that.
  const quiz = buildQuiz({ themePreset: 'arcade', themeTrust: 'full' });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  const option = page.locator('.qwiz-option').first();
  await expect(option).toHaveCSS('background-color', ARCADE_PANEL);
  await option.hover();
  await expect(option).not.toHaveCSS('background-color', ARCADE_PANEL);
  await expect(option).not.toHaveCSS('background-color', 'rgb(250, 250, 250)');
});

test('a quiz from outside asks before running its author’s CSS, and Skip it means skip', async ({
  page
}) => {
  // `themeTrust` unset is what an imported or shared quiz looks like: nobody has been asked yet.
  const quiz = buildQuiz({
    themePreset: 'arcade',
    themeCss: '.qwiz-title { color: rgb(1, 2, 3); }'
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(page.getByText('This quiz brings its own styling.')).toBeVisible();
  // The PRESET is this app's own stylesheet named by the file, so it applies with nothing asked.
  // Only the author's own CSS waits for an answer.
  await expect(page.locator('.qwiz-welcome')).toHaveCSS('background-color', ARCADE_SURFACE);
  await expect(page.locator('.qwiz-title')).not.toHaveCSS('color', AUTHOR_INK);

  await page.getByRole('button', { name: 'Skip it' }).click();
  await expect(page.getByText('This quiz brings its own styling.')).toBeHidden();
  await expect(page.locator('.qwiz-title')).not.toHaveCSS('color', AUTHOR_INK);
});

test('Allow it runs the author’s CSS, and the answer is remembered', async ({ page }) => {
  const quiz = buildQuiz({ themeCss: '.qwiz-title { color: rgb(1, 2, 3); }' });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });
  await page.getByRole('button', { name: 'Allow it' }).click();

  await expect(page.locator('.qwiz-title')).toHaveCSS('color', AUTHOR_INK);

  // Persisted on the quiz, so a quiz in your own library asks once rather than every time.
  await play.goto(quiz.id, { start: false });
  await expect(page.getByText('This quiz brings its own styling.')).toBeHidden();
  await expect(page.locator('.qwiz-title')).toHaveCSS('color', AUTHOR_INK);
});

test('a quiz you wrote yourself never asks', async ({ page }) => {
  const quiz = buildQuiz({
    themeCss: '.qwiz-title { color: rgb(1, 2, 3); }',
    themeTrust: 'full'
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(page.getByText('This quiz brings its own styling.')).toBeHidden();
  await expect(page.locator('.qwiz-title')).toHaveCSS('color', AUTHOR_INK);
});

test('the builder’s Theme panel picks a look, and says which one when collapsed', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  const toggle = page.getByRole('button', { name: /^Theme ·/ });
  await expect(toggle).toHaveText(/Follows the app theme/);

  await toggle.click();
  await page.getByRole('button', { name: /^Arcade/ }).click();
  await expect(toggle).toHaveText(/Arcade/);
});

test('the preview shows the look, pages through the run, and applies your own CSS', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await page.getByRole('button', { name: /^Theme ·/ }).click();
  await page.getByRole('button', { name: /^Arcade/ }).click();

  const preview = page.locator('[data-preview]');
  await expect(preview.locator('.qwiz-welcome')).toHaveCSS('background-color', ARCADE_SURFACE);

  // The verdict banner only exists on the answered screen, so reaching it proves pagination.
  await expect(preview.locator('.qwiz-verdict')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next screen' }).click();
  // The third option, not the first: the preview marks one selected and one wrong so the states
  // are visible, so only this one wears the plain panel colour.
  await expect(preview.locator('.qwiz-option').nth(2)).toHaveCSS('background-color', ARCADE_PANEL);
  await page.getByRole('button', { name: 'Next screen' }).click();
  await expect(preview.locator('.qwiz-verdict')).toBeVisible();

  await page
    .getByLabel('Custom CSS for this quiz')
    .fill('.qwiz-question-text { color: rgb(1, 2, 3); }');
  await expect(preview.locator('.qwiz-question-text')).toHaveCSS('color', 'rgb(1, 2, 3)');

  // Scoped: the builder around it must not wear the quiz's look.
  await expect(page.locator('body')).not.toHaveCSS('background-color', 'rgb(26, 16, 64)');
});

test('a quiz’s look travels in its .qwiz document', async ({ page }) => {
  const quiz = buildQuiz({
    themePreset: 'arcade',
    themeCss: '.qwiz-title { color: rgb(1, 2, 3); }'
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  const document = page.getByRole('textbox', { name: 'Quiz .qwiz source' });
  await expect(document).toHaveValue(/theme: arcade/);
  await expect(document).toHaveValue(/theme-css:/);
  await expect(document).toHaveValue(/\.qwiz-title/);
});
