import type { Page } from '@playwright/test';

/** Serves a blank local page in place of any third-party embed the app renders.
 *
 * The only external resource this app ever loads is a YouTube iframe for a `!<youtube>` media line
 * (see `extractYoutubeId`), and the picture-round example uses one. Letting a test actually fetch
 * it makes the suite depend on youtube.com being reachable from CI, and drags in whatever that page
 * decides to log — Firefox reports a rejected cross-site cookie from it as a console *error*, which
 * has nothing to do with this app but is indistinguishable from one that does.
 *
 * Fulfilled with a real 200 rather than aborted: a blocked request is itself a console error, so
 * aborting would trade one piece of noise for another. What's being tested is that the app renders
 * an iframe pointing at the right URL, not what YouTube serves back. */
export async function stubExternalEmbeds(page: Page): Promise<void> {
  await page.route('**://www.youtube.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>stubbed embed</title>'
    })
  );
}

/** Whether a console message came from the app itself rather than from an embedded third-party
 * frame — so a test asserting "the app logged no errors" means exactly that. */
export function isAppConsoleMessage(url: string, baseURL: string): boolean {
  if (!url) return true; // no location: an app-thrown error, not a resource
  try {
    return new URL(url).origin === new URL(baseURL).origin;
  } catch {
    return true;
  }
}
