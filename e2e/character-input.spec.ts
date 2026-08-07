import { expect, test } from '@playwright/test';
import { buildCharacterInputQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('guessing letters reveals them, wrong guesses are penalized, and the bank locks used letters', async ({
  page
}) => {
  const quiz = buildCharacterInputQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  const answerRow = page.getByRole('group', { name: 'Answer, revealed so far' });

  // "P" is pre-revealed via the [P] bracket; the rest of "Paris" starts blank.
  await expect(answerRow.getByText('P', { exact: true })).toBeVisible();

  const correctLetter = page.getByRole('button', { name: 'r', exact: true });
  const wrongLetter = page.getByRole('button', { name: 'z', exact: true });

  await correctLetter.click();
  await expect(correctLetter).toBeDisabled();
  await expect(answerRow.getByText('r', { exact: true })).toBeVisible();

  await wrongLetter.click();
  await expect(wrongLetter).toBeDisabled();

  await play.submitAnswerButton.click();
  // point (default 1) for the correct "r" guess, penalty (-1) for the wrong "z" guess -> net 0,
  // out of max 4 (5 distinct letters in "paris" minus the pre-revealed "p").
  await expect(page.getByText('0 / 4 points')).toBeVisible();

  // Submitting reveals the full answer regardless of how much was actually guessed.
  await expect(answerRow.getByText('a', { exact: true })).toBeVisible();
  await expect(answerRow.getByText('i', { exact: true })).toBeVisible();
  await expect(answerRow.getByText('s', { exact: true })).toBeVisible();

  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();
});

test('pre-reveal letters can be authored from form mode, and only one accepted answer is ever offered', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Hangman Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('guess_letters');
  await builder.questionTextInput().fill('Guess the capital of France');
  await page.getByPlaceholder('Answer', { exact: true }).fill('Paris');

  // guess_letters allows exactly one accepted answer — form mode never offers a way to add a
  // second one (the parser would reject it anyway).
  await expect(page.getByRole('button', { name: 'Add accepted answer' })).not.toBeVisible();

  const letterP = page.getByRole('button', { name: /letter "P" \(position 1\)/ });
  await expect(letterP).toHaveAttribute('aria-pressed', 'false');
  await letterP.click();
  await expect(letterP).toHaveAttribute('aria-pressed', 'true');

  // Round-trips into the `[P]` pre-reveal bracket in code mode.
  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.getByRole('textbox', { name: 'Question .qwiz source' })).toHaveValue(
    /=\[P\]aris/
  );
});
