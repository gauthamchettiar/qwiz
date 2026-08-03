import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('every run opens on a welcome screen, and Start begins it', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(page.getByRole('heading', { name: quiz.title, level: 1 })).toBeVisible();
  await expect(page.getByText(quiz.description)).toBeVisible();
  await expect(play.rulesHeading).toBeVisible();
  await expect(play.ruleItems.first()).toBeVisible();

  // Nothing of the run itself is on screen yet.
  await expect(play.progressLabel()).toBeHidden();
  await expect(page.getByText('What is the capital of France?')).toBeHidden();

  await play.start();
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
  await expect(page.getByText('What is the capital of France?')).toBeVisible();
  await expect(play.startQuizButton).toBeHidden();
});

test('no clock runs while the rules are still being read', async ({ page }) => {
  // The point of the whole phase: a quiz whose entire budget is three seconds must not burn it
  // while the player is reading what the rules are.
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, timer_mode: 'per_quiz', timer_seconds: 3 }
  });
  await seedQuizzes(page, [quiz]);

  await page.clock.install();
  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await page.clock.runFor(10_000);

  await expect(play.startQuizButton).toBeVisible();
  await expect(play.resultHeading()).toBeHidden();

  // Only now does the budget start, with its full three seconds.
  await play.start();
  await expect(page.getByText('0:03')).toBeVisible();
});

test('the rules describe the settings this quiz was actually authored with', async ({ page }) => {
  const quiz = buildQuiz({
    settings: {
      shuffle_questions: false,
      questions_per_run: 2,
      timer_mode: 'per_quiz',
      timer_seconds: 90,
      reveal_answers: 'at_end',
      reveal_scores: 'at_end',
      points_to_win: 3
    },
    questions: [
      { id: 'q1', code: ['A?', '{', '=yes', '~no', '}'].join('\n') },
      { id: 'q2', code: ['B?', '{', '=yes', '~no', '}'].join('\n') },
      { id: 'q3', code: ['C?', '{', '=yes', '~no', '}'].join('\n') },
      { id: 'q4', code: ['D?', '{', '=yes', '~no', '}'].join('\n') }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(play.ruleItems.filter({ hasText: /2 questions, drawn at random/ })).toBeVisible();
  await expect(play.ruleItems.filter({ hasText: /1 minute 30 seconds for the whole quiz/ })).toBeVisible(); // prettier-ignore
  await expect(play.ruleItems.filter({ hasText: /move back and forth/ })).toBeVisible();
  await expect(
    play.ruleItems.filter({ hasText: /stay hidden until the whole quiz/ })
  ).toBeVisible();
  await expect(play.ruleItems.filter({ hasText: /Score 3 points or more to win/ })).toBeVisible();

  // shuffle_questions is off, so no "random order" rule should be claiming otherwise.
  await expect(play.ruleItems.filter({ hasText: /random order/ })).toHaveCount(0);
});

test("a default quiz's rules cover locking and skipping", async ({ page }) => {
  const quiz = buildQuiz({ settings: {} });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(play.ruleItems.filter({ hasText: /locks that question in/ })).toBeVisible();
  await expect(play.ruleItems.filter({ hasText: /Any question can be skipped/ })).toBeVisible();
  await expect(play.ruleItems.filter({ hasText: /random order/ })).toBeVisible();
});

test('Play again goes straight back to question 1, not to the rules', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  await play.playAgainButton.click();
  await expect(play.progressLabel()).toHaveText('Question 1 of 2');
  await expect(play.startQuizButton).toBeHidden();
});

test('a quiz with no questions says so instead of offering a Start button', async ({ page }) => {
  const quiz = buildQuiz({ questions: [] });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id, { start: false });

  await expect(page.getByText('This quiz has no questions yet')).toBeVisible();
  await expect(play.startQuizButton).toBeHidden();
});
