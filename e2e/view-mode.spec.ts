import { expect, test } from '@playwright/test';
import type { Quiz } from '../src/lib/schemas/quiz';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** One saved question per variant, so the editor renders every preview shape at once. */
function buildAllVariantsQuiz(): Quiz {
  return buildQuiz({
    title: 'Preview shapes',
    questions: [
      {
        id: 'q1',
        code: ['pick_one: Capital of France?', '{', '=Paris', '~Lyon', '}'].join('\n')
      },
      { id: 'q2', code: ['type_answer: Capital of Italy?', '{', '=Rome', '=Roma', '}'].join('\n') },
      {
        id: 'q3',
        code: ['guess_letters: Capital of France', '{', '=[P]aris', '}'].join('\n')
      },
      {
        id: 'q4',
        code: ['order_items: Order these', '{', '=Alpha', '=Beta', '=Gamma', '}'].join('\n')
      },
      {
        id: 'q5',
        code: ['match_pairs: Match capitals', '{', '=Paris -> France', '=Tokyo -> Japan', '}'].join(
          '\n'
        )
      },
      {
        id: 'q6',
        code: [
          'group_items: Sort animals',
          '{',
          '=Fish -> Water',
          '=Frog -> Water',
          '=Lion -> Land',
          '}'
        ].join('\n')
      },
      {
        id: 'q7',
        code: [
          'fill_blanks: The ___ is the powerhouse of the ___.',
          '{',
          '=mitochondria',
          '=cell',
          '~nucleus',
          '}'
        ].join('\n')
      }
    ]
  });
}

test('view mode names every variant in plain language', async ({ page }) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  for (const label of [
    'Pick one',
    'Type the answer',
    'Guess the letters',
    'Put in order',
    'Match pairs',
    'Sort into buckets',
    'Fill the blanks'
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
});

test('order previews the authored sequence as a numbered answer key, not a list of ticks', async ({
  page
}) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  // Every item in an `order_items` question is "correct" — the sequence is the answer — so a per-item
  // Correct/Incorrect verdict (which is what this used to render) says nothing.
  await expect(page.getByText('Correct order')).toBeVisible();
  const orderCard = page.locator('[data-question-id="q4"]');
  await expect(orderCard.getByText('Correct', { exact: true })).toHaveCount(0);
  for (const [position, item] of ['Alpha', 'Beta', 'Gamma'].entries()) {
    const row = orderCard.getByRole('button').filter({ hasText: item });
    await expect(row).toContainText(String(position + 1));
  }
});

test('match previews each pair, and group_items groups items under their bucket', async ({
  page
}) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  const matchCard = page.locator('[data-question-id="q5"]');
  await expect(matchCard.getByText('Correct pairs')).toBeVisible();
  await expect(matchCard.getByRole('button').filter({ hasText: 'Paris' })).toContainText('France');
  await expect(matchCard.getByRole('button').filter({ hasText: 'Tokyo' })).toContainText('Japan');

  // The grouping IS the answer, so both Water animals sit under one heading rather than in a flat
  // list where the pairing is invisible.
  const categoriseCard = page.locator('[data-question-id="q6"]');
  await expect(categoriseCard.getByText('Correct grouping')).toBeVisible();
  const waterGroup = categoriseCard.getByRole('group', { name: 'Water' });
  await expect(waterGroup).toContainText('Fish');
  await expect(waterGroup).toContainText('Frog');
  await expect(waterGroup).not.toContainText('Lion');
});

test('fill_blanks previews the sentence with its answers in place, decoys listed apart', async ({
  page
}) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  const card = page.locator('[data-question-id="q7"]');
  // Reading the finished sentence is the only way to tell whether the answers work in place.
  await expect(card).toContainText('The mitochondria is the powerhouse of the cell.');
  await expect(card.getByText('Decoy words')).toBeVisible();
  await expect(card.getByText('nucleus')).toBeVisible();
});

test('guess_letters previews the answer with its authored pre-reveals already showing', async ({
  page
}) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  const card = page.locator('[data-question-id="q3"]');
  await expect(
    card.getByText('Green letters are revealed before the player starts.')
  ).toBeVisible();
  // One box per character of "Paris" — the `[P]` bracket the author wrote isn't visible outside
  // code mode any other way.
  for (const char of ['P', 'a', 'r', 'i', 's']) {
    await expect(card.getByText(char, { exact: true })).toBeVisible();
  }
});

test('clicking a previewed option still opens the form focused on that option', async ({
  page
}) => {
  const quiz = buildAllVariantsQuiz();
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);

  // Click-to-edit is the whole point of view mode, and it has to survive the previews being
  // regrouped — group_items renders items under bucket headings rather than in authored order, so a
  // preview row's position no longer matches its option index.
  const categoriseCard = page.locator('[data-question-id="q6"]');
  await categoriseCard.getByRole('button', { name: /Lion/ }).click();

  await expect(page.getByPlaceholder('Item').nth(2)).toBeFocused();
  await expect(page.getByPlaceholder('Item').nth(2)).toHaveValue('Lion');
});
