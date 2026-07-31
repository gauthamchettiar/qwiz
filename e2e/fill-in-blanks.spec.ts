import { expect, test } from '@playwright/test';
import { buildFillInBlanksQuiz, buildPictureFillInBlanksQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('authoring a fill_blanks question keeps the correct checkbox, unlike order/match/group_items', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Fill in the Blanks Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('fill_blanks');
  await builder.questionTextInput().fill('The ___ is the powerhouse of the ___.');

  await expect(page.getByRole('checkbox', { name: 'Correct' })).toHaveCount(2);

  await page.getByPlaceholder('Blank answer').nth(0).fill('mitochondria');
  await page.getByRole('checkbox', { name: 'Correct' }).nth(1).check();
  await page.getByPlaceholder('Blank answer').nth(1).fill('cell');
  await builder.addOption();
  // The 3rd row starts unchecked (a distractor) — leave it that way.
  await page.getByPlaceholder('Distractor word').fill('nucleus');

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.locator('main textarea.font-mono')).toHaveValue(
    /=mitochondria[\s\S]*=cell[\s\S]*~nucleus/
  );
});

test('bank mode: picking bank words into blanks wins full credit', async ({ page }) => {
  const quiz = buildFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText('Tap a word to pick it up')).toBeVisible();

  await page.getByRole('button', { name: 'mitochondria', exact: true }).click();
  await page.getByRole('button', { name: /Blank 1/ }).click();
  await page.getByRole('button', { name: 'cell', exact: true }).click();
  await page.getByRole('button', { name: /Blank 2/ }).click();

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('bank mode: the bank words can be pictures', async ({ page }) => {
  const quiz = buildPictureFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // A picture bank word is named by its alt text — the picture is the label, there's no caption.
  await page.getByRole('button', { name: 'Red swatch', exact: true }).click();
  await page.getByRole('button', { name: /Blank 1/ }).click();
  await page.getByRole('button', { name: 'Blue swatch', exact: true }).click();
  await page.getByRole('button', { name: /Blank 2/ }).click();

  // The placed picture is now inside the blank, in the sentence.
  await expect(page.getByRole('button', { name: /Blank 1/ }).getByRole('img')).toBeVisible();

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('bank mode: two words spelled the same are used up independently', async ({ page }) => {
  // A blank records WHICH option was placed rather than the word it showed, so placing one of two
  // identical buttons must not grey out the other — it used to, because "used" was matched by text.
  const quiz = buildFillInBlanksQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'fill_blanks: Say it twice: ___ and ___.',
          '{',
          '=echo',
          '=echo',
          '}',
          ':partial_credit=true'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  const bankWords = page.getByRole('button', { name: 'echo', exact: true });
  await expect(bankWords).toHaveCount(2);

  await bankWords.first().click();
  await page.getByRole('button', { name: /Blank 1/ }).click();

  // The other "echo" is still pickable — and picking it fills the second blank.
  await expect(bankWords.nth(1)).toBeEnabled();
  await bankWords.nth(1).click();
  await page.getByRole('button', { name: /Blank 2/ }).click();

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('bank mode: an incomplete answer cannot be submitted', async ({ page }) => {
  const quiz = buildFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: 'mitochondria', exact: true }).click();
  await page.getByRole('button', { name: /Blank 1/ }).click();

  await expect(play.submitAnswerButton).toBeDisabled();
});

test('type mode: typed answers are matched with the same tolerances a typed question uses', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'fill_blanks: The ___ is the powerhouse of the ___.',
          '{',
          '=mitochondria',
          '=cell',
          '~nucleus',
          '}',
          ':answer_mode=type',
          ':typo_tolerance=15'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByLabel('Blank 1').fill('mitochondri'); // typo, forgiven by typo_tolerance
  await page.getByLabel('Blank 2').fill('CELL'); // case, always ignored by default

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});
