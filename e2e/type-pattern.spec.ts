import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** One `=` pattern and one `~` pattern that deliberately overlaps a different part of the space —
 * enough to exercise both markers, which is what makes this variant different from `type_answer`. */
function buildPatternQuiz() {
  return buildQuiz({
    title: 'Pattern quiz',
    questions: [
      {
        id: 'p1',
        code: [
          'type_pattern: Give any year in the 1990s.',
          '{',
          '=199[0-9]',
          '~19[0-8][0-9]',
          '}'
        ].join('\n')
      }
    ]
  });
}

test('a response matching a correct pattern wins the points', async ({ page }) => {
  const quiz = buildPatternQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await play.typedAnswerInput.fill('1995');
  await play.submitAnswerButton.click();

  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  // The reveal names the pattern that actually fired, not just the verdict — with regex answers
  // that's the part an author (or a player learning the rule) needs to see.
  await expect(page.getByText('← matched')).toBeVisible();
  await expect(page.getByText('199[0-9]')).toBeVisible();
});

test('a matching "~" pattern marks the answer wrong even though a "=" pattern could match too', async ({
  page
}) => {
  const quiz = buildQuiz({
    title: 'Overlapping patterns',
    questions: [
      {
        id: 'p1',
        // "anything except Paris" — the `~` has to win, or it would be dead the moment `=.+` matched.
        code: [
          'type_pattern: Name a French city that is not the capital.',
          '{',
          '=.+',
          '~[Pp]aris',
          '}'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await play.typedAnswerInput.fill('Paris');
  await play.submitAnswerButton.click();

  await expect(page.getByText('Not quite')).toBeVisible();
});

test('a response matching nothing at all scores zero rather than erroring', async ({ page }) => {
  const quiz = buildPatternQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await play.typedAnswerInput.fill('not a year');
  await play.submitAnswerButton.click();

  await expect(page.getByText('Not quite')).toBeVisible();
  await expect(page.getByText('0 / 1 points')).toBeVisible();
});

test('authoring a type_pattern question keeps its =/~ markers through a save and reload', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Regex Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('type_pattern');
  await builder.questionTextInput().fill('Give any year in the 1990s.');

  // Unlike type_answer, the correct checkbox stays meaningful here, so the second row is authored
  // as an explicitly-wrong pattern rather than a second accepted answer.
  await page.getByPlaceholder('Pattern that is correct').first().fill('199[0-9]');
  await builder.correctCheckbox(1).uncheck();
  await page.getByPlaceholder('Pattern to mark wrong').fill('19[0-8][0-9]');

  await builder.saveButton.click();
  await expect(page).toHaveURL(/\/local\/edit\?id=/);

  await page.reload();
  await expect(page.getByText('Match a pattern')).toBeVisible();
  await expect(page.getByText('199[0-9]')).toBeVisible();
  await expect(page.getByText('19[0-8][0-9]')).toBeVisible();
});

test('an uncompilable pattern is reported rather than silently never matching', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Broken regex');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('type_pattern');
  await builder.questionTextInput().fill('Anything');
  await page.getByPlaceholder('Pattern that is correct').first().fill('(unclosed');

  await expect(page.getByText(/isn't a valid regular expression/)).toBeVisible();
});
