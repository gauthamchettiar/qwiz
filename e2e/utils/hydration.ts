import type { Page } from '@playwright/test';

/** Waits until every Astro island on the page has hydrated.
 *
 * `page.goto` resolves on the browser's `load` event, which is BEFORE an island's JS has run — so a
 * keystroke sent immediately afterwards can land on an element whose event handlers don't exist yet.
 * `fill()` still appears to work (Playwright sets the value directly, no handler needed), which is
 * what made this so easy to miss: only interactions that genuinely need a listener, like pressing
 * Enter, silently did nothing. It reproduced about 1 run in 12.
 *
 * Astro renders each island as `<astro-island ssr>` and drops the `ssr` attribute once it hydrates,
 * so their absence is the signal. Waiting on a locator instead wouldn't work: the markup is
 * server-rendered, so every element is already there and visible before any of it is live. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
