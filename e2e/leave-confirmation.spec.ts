import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test("clicking an in-page link mid-run shows this app's own leave-confirmation modal; finishing the run does not", async ({
  page
}) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Clicking a real in-page link (the play screen's minimal header "Back" link) mid-run is
  // intercepted before it navigates — this app's own modal appears instead of the browser's
  // generic beforeunload dialog, since a click (unlike back/forward/tab-close/refresh) can be
  // caught before the navigation starts.
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  const leaveDialog = page.getByRole('dialog');
  await expect(leaveDialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/local/play\\?id=${quiz.id}`));

  // Staying keeps the player on the play page with the run intact.
  await leaveDialog.getByRole('button', { name: 'Stay' }).click();
  await expect(leaveDialog).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/local/play\\?id=${quiz.id}`));

  // Confirming leave actually navigates away.
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await leaveDialog.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL('/');

  // Back to a fresh, in-progress run: the browser back/forward/tab-close/refresh paths can't be
  // intercepted before they unload, so those still fall back to the native beforeunload prompt.
  await play.goto(quiz.id);
  let dialogCount = 0;
  page.on('dialog', (dialog) => {
    dialogCount++;
    void dialog.dismiss();
  });
  // Chrome requires a real user interaction with the page before it'll show a beforeunload
  // prompt at all (a spam-prevention measure) — toggling an option on and back off gives the
  // page that interaction without otherwise changing what this test is checking.
  await play.choiceOption('Paris').click();
  await play.choiceOption('Paris').click();
  // Dismissing the beforeunload prompt cancels the navigation, so it never reaches "load" —
  // `goBack()` would otherwise hang until its own timeout waiting for a navigation that isn't
  // coming.
  await page.goBack({ timeout: 3000 }).catch(() => {});
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

  // ...and now leaving prompts nothing, whether by link click or by the browser back button.
  await page.getByRole('link', { name: 'Back to quizzes' }).click();
  await expect(page).toHaveURL('/');
  expect(dialogCount).toBe(1); // unchanged — no new dialog after finishing
});
