import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('the Code button opens the whole quiz as one .qwiz document', async ({ page }) => {
  const quiz = buildQuiz({ title: 'Whole file' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  const source = builder.fileSourceInput;
  await expect(source).toBeVisible();
  // Frontmatter AND every question, not just the metadata block the card's own <> button edits.
  await expect(source).toHaveValue(/title: Whole file/);
  await expect(source).toHaveValue(/What is the capital of France\?/);
  await expect(source).toHaveValue(/type_answer: What is the capital of Italy\?/);

  // The card and question editors are replaced while it's open — two editable copies of one quiz
  // would leave it ambiguous which one a save actually uses.
  await expect(page.getByLabel('Title', { exact: true })).toBeHidden();
});

test('editing the document rewrites the title and the questions behind it', async ({ page }) => {
  const quiz = buildQuiz({ title: 'Before' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  await builder.fileSourceInput.fill(
    [
      '---',
      'title: After',
      'description: Rewritten wholesale.',
      'category: geography',
      'tags: [e2e]',
      '---',
      '',
      'pick_one: What is 2 + 2?',
      '{',
      '=4',
      '~5',
      '}'
    ].join('\n')
  );
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('After');
  await expect(page.getByText('What is 2 + 2?')).toBeVisible();

  // And it survives a save + reload, which is the actual promise.
  await builder.saveButton.click();
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('After');
  await expect(page.getByText('What is 2 + 2?')).toBeVisible();
});

test('a document that does not parse reports the error and refuses to apply', async ({ page }) => {
  const quiz = buildQuiz({ title: 'Keep me' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  await builder.fileSourceInput.fill(
    ['---', 'title: Broken', '---', '', 'pick_one: Two correct options', '{', '=a', '=b', '}'].join(
      '\n'
    )
  );
  await expect(page.getByText(/requires exactly one/)).toBeVisible();

  await page.getByRole('button', { name: 'Apply' }).click();
  // Still in the editor, with the text intact — an invalid document is never silently discarded,
  // and never silently half-applied either.
  await expect(builder.fileSourceInput).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toBeHidden();
});

test('Discard leaves the quiz exactly as it was', async ({ page }) => {
  const quiz = buildQuiz({ title: 'Unchanged' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  await builder.fileSourceInput.fill('---\ntitle: Thrown away\n---\n\npick_one: q\n{\n=a\n~b\n}');
  await page.getByRole('button', { name: 'Discard' }).click();

  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Unchanged');
});

test('wide screens get a live preview beside the source, and Ctrl+S renders into it', async ({
  page
}) => {
  // `xl:` and up only — below that the two panes would each be too narrow to be useful, so the
  // editor keeps the full width (asserted at the end).
  await page.setViewportSize({ width: 1600, height: 1000 });
  const quiz = buildQuiz({
    questions: [{ id: 'q1', code: 'pick_one: Original question?\n{\n=Yes\n~No\n}' }]
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  const preview = page.locator('[data-preview-question="0"]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('Original question?');

  // The preview deliberately tracks the LAST APPLIED document, not every keystroke — otherwise
  // half of every edit would render as a wall of parse errors.
  const editor = page.getByLabel('Quiz .qwiz source');
  // A whole DOCUMENT, frontmatter included — anything less doesn't parse, and `applyFileDraft`
  // correctly refuses to apply source it can't read.
  await editor.fill(
    [
      '---',
      'title: Capitals of Europe',
      '---',
      '',
      'pick_one: Edited question?',
      '{',
      '=Yes',
      '~No',
      '}'
    ].join('\n')
  );
  await expect(preview).toContainText('Original question?');

  // Ctrl+S applies WITHOUT closing: the preview catches up and the source stays on screen.
  await editor.press('ControlOrMeta+s');
  await expect(preview).toContainText('Edited question?');
  await expect(editor).toBeVisible();

  // Narrow: source only.
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(preview).toBeHidden();
});

test('the tick applies and closes, the cross discards', async ({ page }) => {
  const quiz = buildQuiz({
    questions: [{ id: 'q1', code: 'pick_one: Keep me?\n{\n=Yes\n~No\n}' }]
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  // Discard throws the edit away and returns to the cards.
  await builder.fileCodeButton.click();
  await page
    .getByLabel('Quiz .qwiz source')
    .fill(
      [
        '---',
        'title: Capitals of Europe',
        '---',
        '',
        'pick_one: Thrown away?',
        '{',
        '=Yes',
        '~No',
        '}'
      ].join('\n')
    );
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(builder.titleInput).toBeVisible();
  await expect(page.getByText('Keep me?')).toBeVisible();

  // Apply commits it and returns to the cards.
  await builder.fileCodeButton.click();
  await page
    .getByLabel('Quiz .qwiz source')
    .fill(
      [
        '---',
        'title: Capitals of Europe',
        '---',
        '',
        'pick_one: Applied?',
        '{',
        '=Yes',
        '~No',
        '}'
      ].join('\n')
    );
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(builder.titleInput).toBeVisible();
  await expect(page.getByText('Applied?')).toBeVisible();
});

test('opening a code editor puts the caret on the first line', async ({ page }) => {
  const quiz = buildQuiz({
    questions: [{ id: 'q1', code: 'pick_one: First line?\n{\n=Yes\n~No\n}' }]
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.fileCodeButton.click();

  // The browser would restore the caret to the END of the text, landing an author at the bottom
  // of a document they've just opened to read from the top.
  const caret = await page
    .getByLabel('Quiz .qwiz source')
    .evaluate((el: HTMLTextAreaElement) => el.selectionStart);
  expect(caret).toBe(0);
});
