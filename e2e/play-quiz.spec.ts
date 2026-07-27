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

test('shows post-question analysis on the intermediate screen, but not on the end-of-quiz review', async ({
  page
}) => {
  const analysisText = 'Paris has been the capital since the 12th century.';
  const quiz = buildQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'What is the capital of France?',
          `!<analysis>[Why?](${analysisText})`,
          '{',
          '=Paris',
          '~Lyon',
          '~Marseille',
          '}'
        ].join('\n')
      },
      {
        id: 'q2',
        code: ['typed: What is the capital of Italy?', '{', '=Rome', '}'].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText(analysisText)).not.toBeVisible();
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await expect(page.getByText(analysisText)).toBeVisible();

  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  await play.reviewAnswersButton.click();
  await expect(page.getByText('Back to summary')).toBeVisible();
  await expect(page.getByText(analysisText)).not.toBeVisible();
});

test('shows a not-found message for an unknown quiz id', async ({ page }) => {
  const play = new PlayPage(page);
  await play.goto('does-not-exist');
  await expect(play.notFoundMessage).toBeVisible();
});

test('the play screen uses a minimal header — just a back link, no logo/Import/+ New Quiz', async ({
  page
}) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByRole('link', { name: 'Back', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Qwiz' })).not.toBeAttached();
  await expect(page.getByRole('button', { name: 'Import Qwiz' })).not.toBeAttached();
  await expect(page.getByRole('link', { name: '+ New Quiz' })).not.toBeAttached();
});
