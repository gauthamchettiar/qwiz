import { expect, test } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { HomePage } from './pages/HomePage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('shows the empty state when no quizzes are saved', async ({ page }) => {
  const home = new HomePage(page);
  await home.goto();
  await expect(home.emptyState).toBeVisible();
});

test('lists every seeded quiz and lets you delete one via the two-step confirm', async ({
  page
}) => {
  const keep = buildQuiz({ title: 'Keep Me' });
  const remove = buildQuiz({ title: 'Remove Me' });
  await seedQuizzes(page, [keep, remove]);

  const home = new HomePage(page);
  await home.goto();
  await home.expectListed('Keep Me');
  await home.expectListed('Remove Me');

  await home.openCardMenu('Remove Me');
  await home.deleteMenuItem().click();
  // First click only arms the confirm state — the quiz must still be listed.
  await home.expectListed('Remove Me');
  await home.confirmDeleteMenuItem().click();

  await home.expectNotListed('Remove Me');
  await home.expectListed('Keep Me');

  // Persistence: the deletion survives a reload, not just an optimistic client-side update.
  await page.reload();
  await home.expectNotListed('Remove Me');
  await home.expectListed('Keep Me');
});
