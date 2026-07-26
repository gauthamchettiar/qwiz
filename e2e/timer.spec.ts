import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

// A fake clock (installed before navigating to the play page, so it's active before the
// component's own setInterval-based countdowns are created) lets these tests jump straight past a
// timer's duration instead of a real `waitForTimeout`, per this repo's own testing discipline.

test('a per_question timer auto-submits the current answer when it runs out', async ({ page }) => {
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, timer_mode: 'per_question', timer_duration: 3 },
    questions: [
      {
        id: 'q1',
        code: ['single_choice: What is the capital of France?', '{', '=Paris', '~Lyon', '}'].join(
          '\n'
        )
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  await page.clock.install();
  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText('0:03')).toBeVisible();
  await play.choiceOption('Paris').click();

  await page.clock.runFor(3200);

  // The question locked in on its own, with a full-credit reveal since Paris was selected before
  // time ran out — the default timeout action is auto_submit.
  await expect(play.seeResultsButton).toBeVisible();
  await expect(page.getByText('1 / 1 points')).toBeVisible();
});

test('timer_timeout_action=lock_zero scores 0 even if an option was selected before time ran out', async ({
  page
}) => {
  const quiz = buildQuiz({
    settings: {
      shuffle_questions: false,
      timer_mode: 'per_question',
      timer_duration: 3,
      timer_timeout_action: 'lock_zero'
    },
    questions: [
      {
        id: 'q1',
        code: ['single_choice: What is the capital of France?', '{', '=Paris', '~Lyon', '}'].join(
          '\n'
        )
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  await page.clock.install();
  const play = new PlayPage(page);
  await play.goto(quiz.id);
  await play.choiceOption('Paris').click();

  await page.clock.runFor(3200);

  await expect(play.seeResultsButton).toBeVisible();
  await expect(page.getByText('0 / 1 points')).toBeVisible();
});

test('intermediate_screen_duration auto-advances to the next question', async ({ page }) => {
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, intermediate_screen_duration: 2 },
    questions: [
      { id: 'q1', code: ['single_choice: Q1?', '{', '=a', '~b', '}'].join('\n') },
      { id: 'q2', code: ['single_choice: Q2?', '{', '=c', '~d', '}'].join('\n') }
    ]
  });
  await seedQuizzes(page, [quiz]);

  await page.clock.install();
  const play = new PlayPage(page);
  await play.goto(quiz.id);
  await play.choiceOption('a').click();
  await play.submitAnswerButton.click();

  await expect(page.getByText('0:02')).toBeVisible();
  await page.clock.fastForward(1100);
  await expect(page.getByText('0:01')).toBeVisible();
  await page.clock.fastForward(1100);

  await expect(page.getByText('Question 2 of 2', { exact: true })).toBeVisible();
});

test('a per_quiz timer ends the whole run when the shared budget runs out', async ({ page }) => {
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, timer_mode: 'per_quiz', timer_duration: 3 },
    questions: [
      { id: 'q1', code: ['single_choice: Q1?', '{', '=a', '~b', '}'].join('\n') },
      { id: 'q2', code: ['single_choice: Q2?', '{', '=c', '~d', '}'].join('\n') }
    ]
  });
  await seedQuizzes(page, [quiz]);

  await page.clock.install();
  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.clock.runFor(3200);

  // Neither question was ever answered — both score 0, but the run still ends and shows results
  // rather than hanging on the live question forever.
  await expect(play.resultHeading()).toBeVisible();
});
