import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('playing a quiz end to end, answering everything correctly, wins', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  // Default reveal_answers/reveal_scores are both "after_every_question", so submitting locks
  // the question and shows a reveal before advancing.
  await expect(page.getByText('1 / 1 points')).toBeVisible();
  await play.nextQuestionButton.click();

  await expect(play.progressLabel()).toHaveText('Question 2 of 2');
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  await expect(play.resultHeading()).toHaveText('You won!');
  await expect(page.getByText('2 / 2 points (100%)')).toBeVisible();

  await play.playAgainButton.click();
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
});

test('an unanswered run can still be reviewed after finishing', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Submit the choice question blank (min_answers defaults to 0, so that's allowed) and the
  // typed one wrong — a submittable draft is still required (a typed answer can't be blank),
  // but neither answer needs to be correct for the run to complete.
  await play.submitAnswerButton.click();
  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('not rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  await expect(play.resultHeading()).toHaveText('Quiz complete');
  await play.reviewAnswersButton.click();
  await expect(page.getByText('Back to summary')).toBeVisible();
});

test('shows a not-found message for an unknown quiz id', async ({ page }) => {
  const play = new PlayPage(page);
  await play.goto('does-not-exist');
  await expect(play.notFoundMessage).toBeVisible();
});
