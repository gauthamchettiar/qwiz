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
