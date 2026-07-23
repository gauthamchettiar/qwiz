import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('editing an unknown quiz id shows a not-found message', async ({ page }) => {
  const builder = new BuilderPage(page);
  await builder.gotoEdit('does-not-exist');
  await expect(builder.notFoundMessage).toBeVisible();
});

test('a direct link to a real quiz id loads it, and survives a reload', async ({ page }) => {
  const quiz = buildQuiz({ title: 'Deep Linked Quiz' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await expect(builder.titleInput).toHaveValue('Deep Linked Quiz');

  await page.reload();
  await expect(builder.titleInput).toHaveValue('Deep Linked Quiz');
});

test('deleting a quiz from the edit page returns to the home page', async ({ page }) => {
  const quiz = buildQuiz({ title: 'To Be Deleted' });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.deleteQuizButton.click();
  await builder.confirmDeleteQuizButton.click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'To Be Deleted' })).toHaveCount(0);
});
