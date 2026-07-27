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
  // comment on why it's always first).
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

  await builder.addSettingButton(0).click();
  await builder.settingKeySelect(0).selectOption('max_questions');

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

  // The always-visible "Settings" legend lists a "?" next to every suggested key, independent of
  // whether any row has been added yet — the first one is enough to exercise real click-to-open
  // behavior (this used to be a `:hover`-only CSS tooltip, unreachable on a touch screen).
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

  // Question-card settings are index 1 (index 0 is the quiz metadata card's own "Add setting"
  // button — always present regardless of row count). No quiz-wide row was added in this test,
  // so the question's is the only settings ROW on the page, at select index 0.
  await builder.addSettingButton(1).click();
  await builder.settingKeySelect(0).selectOption('option_display');

  await page.getByRole('button', { name: 'Add reveal' }).click();
  await page.getByRole('button', { name: 'Add image' }).click();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
