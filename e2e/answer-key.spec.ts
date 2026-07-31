import { expect, test } from '@playwright/test';
import type { Quiz } from '../src/lib/schemas/quiz';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

// The four board variants used to tint a placement green or red and stop there — telling a player
// they were wrong without ever telling them what was right. `answer_mode=type` had shown an
// "Answer: X" line for exactly this reason (see TypedSlotsBoard); these cover the board halves.
function singleQuestionQuiz(code: string, settings: Quiz['settings'] = {}): Quiz {
  return buildQuiz({
    title: 'Answer key',
    settings: { shuffle_questions: false, shuffle_options: false, ...settings },
    questions: [{ id: 'k1', code }]
  });
}

async function start(page: import('@playwright/test').Page, quiz: Quiz): Promise<PlayPage> {
  await seedQuizzes(page, [quiz]);
  const play = new PlayPage(page);
  await play.goto(quiz.id);
  return play;
}

test('order_items reveals the item that belonged at each position got wrong', async ({ page }) => {
  const quiz = singleQuestionQuiz(
    ['order_items: Arrange chronologically.', '{', '=Stonehenge', '=Pompeii', '}'].join('\n')
  );
  const play = await start(page, quiz);

  // Deliberately reversed, so both positions are wrong.
  await page.getByRole('button', { name: 'Pompeii', exact: true }).click();
  await page.getByRole('button', { name: /Position 1, empty/ }).click();
  await page.getByRole('button', { name: 'Stonehenge', exact: true }).click();
  await page.getByRole('button', { name: /Position 2, empty/ }).click();
  await play.submitAnswerButton.click();

  await expect(page.getByText('Answer:')).toHaveCount(2);
  // Position 1 held Pompeii but wanted Stonehenge, and vice versa — so the key has to name the
  // item per position, not merely list the two items somewhere on the page.
  await expect(page.getByText('Answer: Stonehenge')).toBeVisible();
  await expect(page.getByText('Answer: Pompeii')).toBeVisible();
});

test('match_pairs reveals the correct target for a pair got wrong', async ({ page }) => {
  const quiz = singleQuestionQuiz(
    [
      'match_pairs: Match each capital to its country.',
      '{',
      '=Paris -> France',
      '=Tokyo -> Japan',
      '}'
    ].join('\n')
  );
  const play = await start(page, quiz);

  await page.getByRole('button', { name: 'Paris', exact: true }).click();
  await page.getByRole('button', { name: 'Japan' }).click();
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click();
  await page.getByRole('button', { name: 'France' }).click();
  await play.submitAnswerButton.click();

  await expect(page.getByText('Answer:')).toHaveCount(2);
});

test('group_items reveals the bucket an item actually belonged in', async ({ page }) => {
  const quiz = singleQuestionQuiz(
    ['group_items: Sort these.', '{', '=Salmon -> Water', '=Lion -> Land', '}'].join('\n')
  );
  const play = await start(page, quiz);

  await page.getByRole('button', { name: 'Salmon', exact: true }).click();
  await page
    .getByRole('group', { name: 'Land' })
    .getByRole('button', { name: 'Place here' })
    .click();
  await page.getByRole('button', { name: 'Lion', exact: true }).click();
  await page
    .getByRole('group', { name: 'Water' })
    .getByRole('button', { name: 'Place here' })
    .click();
  await play.submitAnswerButton.click();

  await expect(page.getByText('Answer:')).toHaveCount(2);
});

test('fill_blanks reveals the word a blank should have held', async ({ page }) => {
  const quiz = singleQuestionQuiz(
    [
      'fill_blanks: The ___ is the powerhouse of the cell.',
      '{',
      '=mitochondria',
      '~nucleus',
      '}'
    ].join('\n')
  );
  const play = await start(page, quiz);

  await page.getByRole('button', { name: 'nucleus', exact: true }).click();
  await page.getByRole('button', { name: /Blank 1, empty/ }).click();
  await play.submitAnswerButton.click();

  await expect(page.getByText('Not quite')).toBeVisible();
  // Asserted through the blank's accessible name rather than its visible text: "mitochondria" is
  // also sitting in the word bank, and it's the BLANK that has to carry the correction.
  await expect(page.getByRole('button', { name: /the answer was mitochondria/ })).toBeVisible();
});

test('an item never placed at all still gets its answer revealed', async ({ page }) => {
  // The one case a wrong placement can't cover: an item left in the pool has no tinted chip in any
  // bucket to speak for it, so without the pool's own answer key the review says nothing about it.
  // Reachable via a timer, since Submit stays disabled until a board is complete.
  const quiz = singleQuestionQuiz(
    ['group_items: Sort these.', '{', '=Salmon -> Water', '=Lion -> Land', '}'].join('\n'),
    { timer_mode: 'per_question', timer_seconds: 1, on_timeout: 'auto_submit' }
  );
  await start(page, quiz);

  await expect(page.getByText('Answer:')).toHaveCount(2);
});

test('a correct placement shows no answer key — there is nothing to correct', async ({ page }) => {
  const quiz = singleQuestionQuiz(
    ['order_items: Arrange chronologically.', '{', '=Stonehenge', '=Pompeii', '}'].join('\n')
  );
  const play = await start(page, quiz);

  for (const [item, slot] of [
    ['Stonehenge', 1],
    ['Pompeii', 2]
  ] as const) {
    await page.getByRole('button', { name: item, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`Position ${slot}, empty`) }).click();
  }
  await play.submitAnswerButton.click();

  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByText('Answer:')).toHaveCount(0);
});
