import { expect, test } from '@playwright/test';
import type { Quiz } from '../src/lib/schemas/quiz';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** One question of every variant in a single run, so the Review screen has to render all of them.
 * This is the regression fixture for the bug where Review only ever understood choice and typed
 * answers: every other variant's AnswerRecord reached it as a `selected` set that doesn't exist on
 * that record, throwing mid-render and taking the whole screen down with it. */
function buildEveryVariantQuiz(): Quiz {
  return buildQuiz({
    title: 'Every variant',
    questions: [
      { id: 'q1', code: ['What is 2 + 2?', '{', '=4', '~5', '}'].join('\n') },
      { id: 'q2', code: ['typed: Capital of Italy?', '{', '=Rome', '}'].join('\n') },
      {
        id: 'q3',
        code: [
          'character_input: Capital of France',
          '{',
          '=[P]aris',
          '}',
          ':letter_bank=alphabet'
        ].join('\n')
      },
      { id: 'q4', code: ['order: Arrange them', '{', '=First', '=Second', '}'].join('\n') },
      {
        id: 'q5',
        code: ['match: Match capitals', '{', '=Paris -> France', '=Tokyo -> Japan', '}'].join('\n')
      },
      {
        id: 'q6',
        code: ['categorise: Sort animals', '{', '=Fish -> Water', '=Lion -> Land', '}'].join('\n')
      },
      {
        id: 'q7',
        code: [
          'fill_in_blanks: The ___ is the powerhouse.',
          '{',
          '=mitochondria',
          '~nucleus',
          '}'
        ].join('\n')
      }
    ]
  });
}

/** Answers whichever question is currently on screen well enough to submit it, then advances.
 * Deliberately not "answers correctly" — Review has to render a mix of right and wrong answers,
 * and each variant's own correctness is already covered by its own spec. */
async function answerCurrentQuestion(page: import('@playwright/test').Page) {
  const play = new PlayPage(page);

  if (await page.getByLabel('4', { exact: true }).isVisible()) {
    await page.getByLabel('4', { exact: true }).check();
  } else if (await play.typedAnswerInput.isVisible()) {
    await play.typedAnswerInput.fill('Rome');
  } else if (await page.getByText('Arrange in the correct order').isVisible()) {
    await page.getByRole('button', { name: 'Second', exact: true }).click();
    await page.getByRole('button', { name: /Position 1, empty/ }).click();
    await page.getByRole('button', { name: 'First', exact: true }).click();
    await page.getByRole('button', { name: /Position 2, empty/ }).click();
  } else if (await page.getByRole('button', { name: 'France', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Paris', exact: true }).click();
    await page.getByRole('button', { name: 'France', exact: true }).click();
    await page.getByRole('button', { name: 'Tokyo', exact: true }).click();
    await page.getByRole('button', { name: 'Japan', exact: true }).click();
  } else if (await page.getByText('Water', { exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Fish', exact: true }).click();
    await page.getByRole('button', { name: 'Place here' }).first().click();
    await page.getByRole('button', { name: 'Lion', exact: true }).click();
    await page.getByRole('button', { name: 'Place here' }).last().click();
  } else if (await page.getByRole('button', { name: 'mitochondria' }).isVisible()) {
    await page.getByRole('button', { name: 'mitochondria' }).click();
    await page.getByRole('button', { name: '___' }).click();
  } else {
    // character_input — submittable at any point, so one guess is enough.
    await page.getByRole('button', { name: 'a', exact: true }).click();
  }

  await play.submitAnswerButton.click();
}

test('Review answers renders every question variant, not just choice and typed', async ({
  page
}) => {
  const quiz = buildEveryVariantQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  for (let i = 0; i < quiz.questions.length; i++) {
    await answerCurrentQuestion(page);
    if (i === quiz.questions.length - 1) {
      await play.seeResultsButton.click();
    } else {
      await play.nextQuestionButton.click();
    }
  }

  await expect(play.resultHeading()).toBeVisible();
  await play.reviewAnswersButton.click();

  // Every question made it onto the screen — before the fix, the first non-choice/typed answer
  // threw during render and nothing after it appeared at all.
  await expect(page.getByText(/^Question \d+ of 7$/)).toHaveCount(7);

  // And each variant's own answer surface is actually rendered there.
  await expect(page.getByText('Capital of Italy?')).toBeVisible();
  await expect(page.getByText('Arrange in the correct order')).toBeVisible();
  await expect(page.getByRole('button', { name: /Position 1, filled/ })).toBeVisible();
  await expect(page.getByText('Sort animals')).toBeVisible();
  await expect(page.getByText('is the powerhouse')).toBeVisible();
});

test('a partly-placed order answer keeps its empty slots on the Review screen', async ({
  page
}) => {
  // "Reveal at the end" mode, which is the one path that grades a question the player never
  // finished: its final Submit grades every draft as-is rather than gating on completeness the way
  // a per-question Submit does. partial_points so the one correctly-placed slot still scores.
  const quiz = buildQuiz({
    title: 'Partial order',
    settings: {
      shuffle_questions: false,
      reveal_answers: 'at_end',
      reveal_scores: 'at_end'
    },
    questions: [
      {
        id: 'q1',
        code: [
          'order: Arrange them',
          '{',
          '=First',
          '=Second',
          '=Third',
          '}',
          ':partial_points=true'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Put "Second" in its own (correct) slot 2 and leave slots 1 and 3 empty. Recording this as a
  // dense [1] array used to replay as "Second in slot 1" — a wrong answer shown as a right one.
  await page.getByRole('button', { name: 'Second', exact: true }).click();
  await page.getByRole('button', { name: /Position 2, empty/ }).click();

  await page.getByRole('button', { name: 'Submit quiz', exact: true }).click();
  await page.getByRole('button', { name: /Are you sure/ }).click();
  await expect(play.resultHeading()).toBeVisible();
  await play.reviewAnswersButton.click();

  // Scoped to the per-question verdict banner — the run summary above it shows the same total.
  await expect(page.getByRole('status').getByText('1 / 3 points')).toBeVisible();

  await expect(page.getByRole('button', { name: /Position 1, empty/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Position 2, filled/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Position 3, empty/ })).toBeVisible();
});

test('the reveal screen says outright whether the answer was right or wrong', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByLabel('Lyon', { exact: true }).check();
  await play.submitAnswerButton.click();
  await expect(page.getByText('Not quite')).toBeVisible();

  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
});
