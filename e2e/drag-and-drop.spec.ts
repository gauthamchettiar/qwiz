import { expect, test } from '@playwright/test';
import {
  buildCategoriseQuiz,
  buildFillInBlanksQuiz,
  buildMatchQuiz,
  buildOrderQuiz
} from './fixtures/quizzes';
import { PlayPage } from './pages/PlayPage';
import { dragOnto } from './utils/drag';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('order_items: dragging items into slots wins full credit, same as tapping them', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await dragOnto(
    page,
    page.getByRole('button', { name: 'First', exact: true }),
    page.getByRole('button', { name: /Position 1, empty/ })
  );
  await expect(page.getByRole('button', { name: /Position 1, filled/ })).toBeVisible();

  await dragOnto(
    page,
    page.getByRole('button', { name: 'Second', exact: true }),
    page.getByRole('button', { name: /Position 2, empty/ })
  );
  await dragOnto(
    page,
    page.getByRole('button', { name: 'Third', exact: true }),
    page.getByRole('button', { name: /Position 3, empty/ })
  );

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('order_items: dragging a placed item onto an occupied slot swaps the two', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Deliberately wrong: Second in slot 1, First in slot 2.
  await dragOnto(
    page,
    page.getByRole('button', { name: 'Second', exact: true }),
    page.getByRole('button', { name: /Position 1, empty/ })
  );
  await dragOnto(
    page,
    page.getByRole('button', { name: 'First', exact: true }),
    page.getByRole('button', { name: /Position 2, empty/ })
  );
  await dragOnto(
    page,
    page.getByRole('button', { name: 'Third', exact: true }),
    page.getByRole('button', { name: /Position 3, empty/ })
  );

  // One drag of slot 1 onto slot 2 should fix both, rather than displacing First to the bank.
  await dragOnto(
    page,
    page.getByRole('button', { name: /Position 1, filled/ }),
    page.getByRole('button', { name: /Position 2, filled/ })
  );

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('order_items: dragging a placed item back to the bank empties its slot', async ({ page }) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await dragOnto(
    page,
    page.getByRole('button', { name: 'First', exact: true }),
    page.getByRole('button', { name: /Position 1, empty/ })
  );
  await expect(page.getByRole('button', { name: /Position 1, filled/ })).toBeVisible();

  await dragOnto(
    page,
    page.getByRole('button', { name: /Position 1, filled/ }),
    page.getByText(/Tap an item to pick it up|Everything's placed/)
  );
  await expect(page.getByRole('button', { name: /Position 1, empty/ })).toBeVisible();
});

test('order_items: a tap is still a tap — a press that barely moves does not start a drag', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  // Press, jiggle by less than the drag threshold, release: this must read as picking the item up,
  // exactly as a clean click does — the two mechanics share one board and can't fight each other.
  const item = page.getByRole('button', { name: 'First', exact: true });
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2 + 2);
  await page.mouse.up();

  await expect(item).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Position 1, empty/ }).click();
  await expect(page.getByRole('button', { name: /Position 1, filled/ })).toBeVisible();
});

test('match_pairs: dragging a left item onto a right target pairs them', async ({ page }) => {
  const quiz = buildMatchQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await dragOnto(
    page,
    page.getByRole('button', { name: 'Paris', exact: true }),
    page.getByRole('button', { name: 'France', exact: true })
  );
  await dragOnto(
    page,
    page.getByRole('button', { name: 'Tokyo', exact: true }),
    page.getByRole('button', { name: 'Japan', exact: true })
  );

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test('group_items: dragging items into bucket trays, and back out to the pool', async ({
  page
}) => {
  const quiz = buildCategoriseQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  const water = page.getByRole('group', { name: 'Water' });
  const land = page.getByRole('group', { name: 'Land' });

  await dragOnto(page, page.getByRole('button', { name: 'Fish', exact: true }), water);
  await dragOnto(page, page.getByRole('button', { name: 'Frog', exact: true }), water);
  // Several items sharing one tray is the whole point of a bucket — both are in there now.
  await expect(water.getByRole('button', { name: 'Fish', exact: true })).toBeVisible();
  await expect(water.getByRole('button', { name: 'Frog', exact: true })).toBeVisible();

  // Wrong tray first, then dragged out to the pool and back to the right one.
  await dragOnto(page, page.getByRole('button', { name: 'Lion', exact: true }), water);
  await dragOnto(
    page,
    water.getByRole('button', { name: 'Lion', exact: true }),
    page.getByText(/Tap an item to pick it up|Everything's placed/)
  );
  await dragOnto(page, page.getByRole('button', { name: 'Lion', exact: true }), land);

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('fill_blanks: dragging bank words into blanks, and dragging one back out', async ({
  page
}) => {
  const quiz = buildFillInBlanksQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  const blank1 = page.getByRole('button', { name: /Blank 1/ });
  const blank2 = page.getByRole('button', { name: /Blank 2/ });

  // Wrong word into the first blank, then dragged back to the bank to undo it.
  await dragOnto(page, page.getByRole('button', { name: 'nucleus' }), blank1);
  await expect(blank1).toHaveAccessibleName('Blank 1, filled with nucleus');

  await dragOnto(page, blank1, page.getByText(/Tap a word to pick it up/));
  await expect(blank1).toHaveAccessibleName('Blank 1, empty');

  await dragOnto(page, page.getByRole('button', { name: 'mitochondria' }), blank1);
  await dragOnto(page, page.getByRole('button', { name: 'cell' }), blank2);

  await play.submitAnswerButton.click();
  await expect(page.getByText('2 / 2 points')).toBeVisible();
});

test("a draggable item opts out of the browser's own touch gestures, so a drag isn't a scroll", async ({
  page
}) => {
  // The regression this covers is subtle and total: `touch-action` is latched when a touch BEGINS,
  // so setting it once a drag was already underway — which is what this used to do — changed
  // nothing about the gesture in flight. The browser started panning on the first movement, fired
  // `pointercancel`, and the drag was torn down before it could start. Touch dragging never worked
  // at all; the page just scrolled.
  //
  // Asserted as a style rather than by driving a real touch drag: Playwright's `page.mouse` always
  // reports `pointerType: 'mouse'`, which takes the movement-threshold path and never exercises
  // touch at all, and a synthetic touch PointerEvent bypasses the very browser behaviour at issue.
  // The computed style is the thing that was actually wrong.
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByRole('button', { name: 'First', exact: true })).toHaveCSS(
    'touch-action',
    'none'
  );

  // The matching opt-out on a LOCKED board (nothing there is draggable, and it's often the longest
  // thing on screen, so it must not become an un-scrollable strip) isn't asserted here: locking
  // renames every item, so there's no stable locator to follow across the transition, and reaching
  // for one would test the naming rather than the touch policy. It's `applyTouchPolicy` in
  // dragDrop.ts, driven by the same `disabled` flag every board already passes.
});
