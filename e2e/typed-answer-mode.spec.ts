import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('order with answer_mode=type: fields instead of a board, graded on the typed sequence', async ({
  page
}) => {
  const quiz = buildQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'order: Put these in order',
          '{',
          '=First',
          '=Second',
          '=Third',
          '}',
          ':answer_mode=type'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // No board at all — the drag/tap slots are replaced by plain fields.
  await expect(page.getByRole('button', { name: /Position 1/ })).toHaveCount(0);
  await expect(page.getByText('Type the item that belongs at each position')).toBeVisible();
  // The items still have to be visible somewhere, or the question is unanswerable.
  await expect(page.getByText('Items to place, in no particular order')).toBeVisible();

  await expect(play.submitAnswerButton).toBeDisabled();
  await page.getByLabel('Answer for position 1').fill('First');
  await page.getByLabel('Answer for position 2').fill('Second');
  await page.getByLabel('Answer for position 3').fill('Third');
  await play.submitAnswerButton.click();

  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('match with answer_mode=type: type each target, with typos forgiven per typo_tolerance', async ({
  page
}) => {
  const quiz = buildQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'match: Match the capitals',
          '{',
          '=Paris -> France',
          '=Tokyo -> Japan',
          '}',
          ':answer_mode=type',
          ':typo_tolerance=40'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText('Type what each item matches with')).toBeVisible();
  // The targets are the answer, so unlike order they are NOT shown for reference.
  await expect(page.getByText('Items to place, in no particular order')).toHaveCount(0);

  await page.getByLabel('Answer for Paris').fill('Frnace'); // typo, inside tolerance
  await page.getByLabel('Answer for Tokyo').fill('japan'); // case ignored by default
  await play.submitAnswerButton.click();

  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('categorise with answer_mode=type shows the accepted answer for a slot got wrong', async ({
  page
}) => {
  const quiz = buildQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'categorise: Sort the animals',
          '{',
          '=Fish -> Water',
          '=Lion -> Land',
          '}',
          ':answer_mode=type',
          ':partial_credit=true'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByLabel('Answer for Fish').fill('Water');
  await page.getByLabel('Answer for Lion').fill('Sky');
  await play.submitAnswerButton.click();

  await expect(page.getByText('1 / 2 points')).toBeVisible();
  await expect(page.getByText('Land', { exact: true })).toBeVisible();
});

test('a quiz-wide answer_mode=type applies to every placement question in the quiz', async ({
  page
}) => {
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, answer_mode: 'type' },
    questions: [
      {
        id: 'q1',
        code: ['match: Match the capitals', '{', '=Paris -> France', '}'].join('\n')
      },
      {
        id: 'q2',
        // The question's own setting always wins over the quiz-wide default.
        code: [
          'categorise: Sort the animals',
          '{',
          '=Fish -> Water',
          '}',
          ':answer_mode=pick'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText('Type what each item matches with')).toBeVisible();
  await page.getByLabel('Answer for Paris').fill('France');
  await play.submitAnswerButton.click();
  await play.nextQuestionButton.click();

  // Second question opted back out, so it keeps its board.
  await expect(page.getByRole('group', { name: 'Water' })).toBeVisible();
});
