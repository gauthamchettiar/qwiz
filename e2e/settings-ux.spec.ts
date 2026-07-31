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

test('tapping a setting\'s "?" opens its description — works via click, not just hover', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // A "?" belongs to a settings ROW now, not to an always-on legend of every key — so there has to
  // be a row before there's anything to explain. Exercises real click-to-open behavior (this used
  // to be a `:hover`-only CSS tooltip, unreachable on a touch screen).
  await builder.openSettings(0);
  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('points_to_win');
  await builder.settingHelpButton(0).click();
  await expect(page.getByText(/Total points a player must reach to "win" this quiz/)).toBeVisible();

  // Clicking elsewhere closes it again.
  await page.getByLabel('Title', { exact: true }).click();
  await expect(page.getByText(/Total points a player must reach to "win" this quiz/)).toBeHidden();
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

  // `exact` because the option list below has its own "Add image" button, whose accessible name
  // ("Add image option") contains this one — Playwright's default substring match would find both.
  await page.getByRole('button', { name: 'Add reveal', exact: true }).click();
  await page.getByRole('button', { name: 'Add image', exact: true }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("an open setting description never widens the page, whatever it's anchored to", async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();

  // A row's "?" sits to the right of the card's own padding, and an absolutely-positioned,
  // trigger-centred panel would hang off the right edge of the document from there — which widens
  // the scrollable area and makes mobile browsers zoom the whole page out to fit it.
  await builder.openSettings(0);
  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('reveal_answers');
  const helpButtons = page.getByRole('button', { name: 'What does this setting do?' });
  await helpButtons.last().click();
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
