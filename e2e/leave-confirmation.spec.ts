import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('leaving an in-progress run prompts a confirmation; finishing it does not', async ({
  page
}) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  let dialogCount = 0;
  page.on('dialog', (dialog) => {
    dialogCount++;
    void dialog.dismiss();
  });

  // Navigating away mid-run (via a real link click, same as a user would) prompts a confirmation
  // — dismissing it keeps the player on the play page.
  await page.getByRole('link', { name: 'Qwiz' }).click();
  await expect(page).toHaveURL(new RegExp(`/local/play\\?id=${quiz.id}`));
  expect(dialogCount).toBe(1);

  // Finish the run...
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await play.nextQuestionButton.click();
  await play.typedAnswerInput.fill('Rome');
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  // ...and now leaving prompts nothing.
  await page.getByRole('link', { name: 'Back to quizzes' }).click();
  await expect(page).toHaveURL('/');
  expect(dialogCount).toBe(1); // unchanged — no new dialog after finishing
});
