import type { Locator, Page } from '@playwright/test';

/** Drags `source` onto `target` with the real pointer gesture the app listens for (see
 * src/lib/utils/dragDrop.ts) — press, move past the drag threshold, then release over the target.
 *
 * The intermediate `steps` matter: a single jump from source to target would arrive at the target
 * having only ever fired one `pointermove`, and the app promotes a press into a drag on the FIRST
 * move past its threshold — so the ghost, and the hit-testing that decides the drop zone, need at
 * least one move before the release. Two moves land on the target so the last one registers it as
 * the hovered zone.
 *
 * Drives a mouse pointer, which starts dragging on movement alone. Touch deliberately requires a
 * hold first (a moving finger is how you scroll a page), which Playwright's mouse API can't
 * express — that path is exercised by hand, not here. */
export async function dragOnto(page: Page, source: Locator, target: Locator): Promise<void> {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('dragOnto: source or target is not visible');

  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
}
