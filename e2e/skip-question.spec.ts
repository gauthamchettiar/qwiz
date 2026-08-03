import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

// Before this, six of the nine variants held Submit shut until the answer was complete, so the
// only ways to move past a question you couldn't answer were to let a timer run out or to author
// the quiz in `reveal_answers=at_end` mode. Every variant is skippable now; `require_answer=true`
// is how an author opts back into the old gate.
const VARIANTS: [string, string][] = [
  ['pick_one', ['pick_one: Capital of France?', '{', '=Paris', '~Lyon', '}'].join('\n')],
  ['pick_many', ['pick_many: Pick the primes.', '{', '=2', '=3', '~4', '}'].join('\n')],
  ['type_answer', ['type_answer: Capital of Italy?', '{', '=Rome', '}'].join('\n')],
  ['type_pattern', ['type_pattern: Any 4-digit year?', '{', '=[0-9]{4}', '}'].join('\n')],
  ['guess_letters', ['guess_letters: Guess the city.', '{', '=Paris', '}'].join('\n')],
  [
    'order_items',
    ['order_items: Put these in order.', '{', '=First', '=Second', '=Third', '}'].join('\n')
  ],
  [
    'match_pairs',
    ['match_pairs: Match the capitals.', '{', '=Paris -> France', '=Rome -> Italy', '}'].join('\n')
  ],
  [
    'group_items',
    ['group_items: Sort these.', '{', '=Salmon -> Water', '=Eagle -> Sky', '}'].join('\n')
  ],
  [
    'fill_blanks',
    ['fill_blanks: The powerhouse of the cell is the ___.', '{', '=mitochondria', '}'].join('\n')
  ]
];

for (const [variant, code] of VARIANTS) {
  test(`${variant} can be submitted with nothing answered`, async ({ page }) => {
    const quiz = buildQuiz({
      questions: [{ id: 'q1', code }],
      settings: { shuffle_questions: false }
    });
    await seedQuizzes(page, [quiz]);

    const play = new PlayPage(page);
    await play.goto(quiz.id);

    await expect(play.submitAnswerButton).toBeEnabled();
    await play.submitAnswerButton.click();

    // Its own verdict, not "Not quite" — a skip and a wrong answer both score zero, and saying
    // "Not quite" to someone who never answered claims they tried and failed.
    await expect(page.getByText('Skipped')).toBeVisible();
    await expect(page.getByText('Not quite')).toBeHidden();
  });
}

test('require_answer=true holds Submit shut until the question is complete', async ({ page }) => {
  const quiz = buildQuiz({
    questions: [
      {
        id: 'q1',
        code: [
          'type_answer: What is the capital of Italy?',
          ':require_answer=true',
          '{',
          '=Rome',
          '}'
        ].join('\n')
      }
    ],
    settings: { shuffle_questions: false }
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(play.submitAnswerButton).toBeDisabled();
  await play.typedAnswerInput.fill('Rome');
  await expect(play.submitAnswerButton).toBeEnabled();
});

test('a quiz-wide require_answer applies to every question in the run', async ({ page }) => {
  const quiz = buildQuiz({
    settings: { shuffle_questions: false, require_answer: true }
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // q1 is pick_one, which was submittable empty even before skipping existed — the quiz-wide
  // setting is what makes it require an answer now.
  await expect(play.submitAnswerButton).toBeDisabled();
  await play.choiceOption('Paris').check();
  await expect(play.submitAnswerButton).toBeEnabled();
});

test('a skipped question reads as Skipped on the results list and survives into review', async ({
  page
}) => {
  const quiz = buildQuiz({ settings: { shuffle_questions: false } });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Skip the choice question, answer the typed one correctly.
  await play.submitAnswerButton.click();
  await expect(page.getByText('Skipped')).toBeVisible();
  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();

  await expect(play.resultHeading()).toBeVisible();
  // The summary list names the skip rather than showing an ambiguous 0 / N.
  await expect(page.getByText('Skipped')).toBeVisible();

  await play.reviewAnswersButton.click();
  await expect(page.getByText('Skipped')).toBeVisible();
});
