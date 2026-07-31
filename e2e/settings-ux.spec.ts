import { expect, test } from '@playwright/test';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('picking a setting key fills its default value, and reopening the field shows every accepted value', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // Quiz metadata card's own settings (index 0 — see BuilderPage.addSettingButton's own doc
  // comment on why it's always first). The panel starts collapsed on a quiz with no settings.
  await builder.openSettings(0);
  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('reveal_answers');

  const value = builder.settingValueInput(0);
  await expect(value).toHaveValue('after_every_question');

  // Clicking an already-filled value field selects all its text and reopens the dropdown with
  // every accepted value — not just the one already typed in.
  await value.click();
  await expect(
    page.getByRole('option', { name: 'after_every_question', exact: true })
  ).toBeVisible();
  await expect(page.getByRole('option', { name: 'at_end', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'never', exact: true })).toBeVisible();
  const selected = await value.evaluate(
    (el: HTMLInputElement) => el.selectionStart === 0 && el.selectionEnd === el.value.length
  );
  expect(selected).toBe(true);
});

test('a numeric/string setting (no fixed value set) gets no dropdown, and no default to pre-fill', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  await builder.openSettings(0);
  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('questions_per_run');

  const value = builder.settingValueInput(0);
  await expect(value).toHaveValue('');
  await value.click();
  await expect(page.getByRole('listbox')).not.toBeAttached();
});

test('tapping a setting key opens its description — works via click, not just hover', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // The key name in the legend IS the trigger — there's no separate "?" button any more.
  // Exercises real click-to-open behavior (this used to be a `:hover`-only CSS tooltip,
  // unreachable on a touch screen).
  await builder.openSettings(0);
  await builder.settingHelpKey('points_to_win').click();
  await expect(page.getByText(/Total points a player must reach to "win" this quiz/)).toBeVisible();

  // Clicking elsewhere closes it again.
  await page.getByLabel('Title', { exact: true }).click();
  await expect(page.getByText(/Total points a player must reach to "win" this quiz/)).toBeHidden();
});

test('opening a settings block lists the keys that variant accepts, each one explainable', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.addQuestion();

  // Collapsed, the legend isn't on screen at all — that was the whole objection to the old
  // always-visible one.
  const legendKey = page.getByRole('button', { name: 'shuffle_options', exact: true });
  await expect(legendKey).toHaveCount(0);

  await builder.openSettings(1);
  await expect(legendKey).toBeVisible();

  // Each key IS its own help trigger, rather than a label sitting beside a separate "?" button.
  await legendKey.click();
  await expect(page.getByRole('note')).toBeVisible();
});

test('a long question, its options, settings, and elements never overflow the viewport horizontally', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  await builder.addQuestion();
  await builder.fillChoiceQuestion(
    'A question with a fairly long piece of text, long enough to actually wrap across multiple lines on a narrow screen',
    'A reasonably long correct answer option, also long enough to wrap',
    'Another somewhat lengthy wrong option for good measure'
  );

  // Toggle index 1 is the question card's (index 0 is the quiz metadata card's, always first).
  // Its "Add setting" is then index 0, not 1 — the quiz card's panel is still collapsed, so its
  // own button isn't in the accessibility tree to be counted. See BuilderPage.addSettingButton.
  await builder.openSettings(1);
  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('options_layout');

  await page.getByRole('button', { name: 'Add reveal' }).click();
  await page.getByRole('button', { name: 'Add image' }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('an option row keeps its text field usable, wrapping it below the row when space runs out', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.addQuestion();
  await builder.fillChoiceQuestion('Narrow row', 'Correct', 'Wrong');

  const field = builder.optionTextInput(0);
  const points = page.getByRole('textbox', { name: 'Points' }).first();
  const fieldBox = await field.boundingBox();
  const pointsBox = await points.boundingBox();
  expect(fieldBox).not.toBeNull();
  expect(pointsBox).not.toBeNull();

  // Whatever the viewport, the field never gets squeezed below a width that shows only a few
  // characters — the row sheds its trailing controls onto a second line before that happens (see
  // QuestionForm's ROW_TRAILING). 11rem is the floor those thresholds are set to preserve.
  expect(fieldBox!.width).toBeGreaterThanOrEqual(176);

  // When the row does wrap it's `pts` that drops BELOW the field, not the other way round: the
  // field leads the row, so the first line is never left holding a grip, a checkbox and a gap.
  const wrapped = pointsBox!.y > fieldBox!.y + fieldBox!.height / 2;
  const sameLine = Math.abs(fieldBox!.y - pointsBox!.y) < pointsBox!.height;
  expect(wrapped || sameLine).toBe(true);
});

test("an open setting description never widens the page, whatever it's anchored to", async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // A legend key sits close to the card's own right padding, and an absolutely-positioned,
  // trigger-centred panel would hang off the right edge of the document from there — which widens
  // the scrollable area and makes mobile browsers zoom the whole page out to fit it. The last key
  // in the legend is the one furthest right, so it's the worst case.
  await builder.openSettings(0);
  await builder.settingHelpKey('typo_tolerance').click();
  await expect(page.getByRole('note')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // And it stays within the viewport rather than being clipped out of reach.
  const box = await page.getByRole('note').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
