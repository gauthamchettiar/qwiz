import type { Page } from '@playwright/test';
import type { Quiz } from '../../src/lib/schemas/quiz';

const STORAGE_KEY = 'qwiz:quizzes';

/** Clears the app's persisted quizzes. Requires the page to already be on the app's origin
 * (localStorage is scoped per-origin), so call this after an initial `page.goto`. */
export async function resetStorage(page: Page): Promise<void> {
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
}

/** Seeds one or more quizzes directly into localStorage, bypassing the builder UI — used to
 * arrange state for specs that exercise something other than authoring itself. Requires the page
 * to already be on the app's origin; navigate again afterwards to see the seeded data reflected. */
export async function seedQuizzes(page: Page, quizzes: Quiz[]): Promise<void> {
  const record = Object.fromEntries(quizzes.map((q) => [q.id, q]));
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: STORAGE_KEY,
    value: JSON.stringify(record)
  });
}

/** Makes every `localStorage.setItem` call throw, as real browsers do once storage is full or
 * (Safari) private browsing disables it entirely — for specs verifying the app surfaces that
 * failure instead of silently claiming success. Must be called before `page.goto`, since it
 * installs the override via `addInitScript` so it's in place before the app's own code runs. */
export async function simulateStorageFull(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
}
