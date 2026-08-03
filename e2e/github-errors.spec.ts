import { expect, test } from '@playwright/test';
import { PlayPage } from './pages/PlayPage';
import { stubNotFound, stubOffline, stubRateLimited, stubRepo } from './utils/github';
import { resetStorage } from './utils/storage';

/** Every way loading from GitHub can fail, and the assertion that each one says something the
 * reader can act on rather than leaving a blank screen. The messages differ on purpose — a rate
 * limit means "wait, or publish a manifest", a 404 means "check the link", offline means "check
 * your connection" — so each is asserted on its own distinguishing phrase. */

const GIST_ID = 'aa5f1c1b8d0d0a3e0e6e9c9a0b1c2d3e';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('a deleted or private gist explains that only public gists work', async ({ page }) => {
  await stubNotFound(page);

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await expect(page.getByRole('alert')).toContainText(/gist doesn't exist, or it's private/);
});

test('a missing file in a real repository says it may have moved', async ({ page }) => {
  await stubRepo(page, 'owner', 'repo', { files: { 'other.qwiz': '---\ntitle: Other\n---' } });

  const play = new PlayPage(page);
  await play.gotoRemote('/play?repo=owner%2Frepo&path=gone.qwiz', { start: false });

  await expect(page.getByRole('alert')).toContainText(/moved, renamed/);
});

test('a rate-limited request names the limit and the way around it', async ({ page }) => {
  await stubRateLimited(page);

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  const alert = page.getByRole('alert');
  // The fix is the part a reader can't guess, and it's the feature's own headline: a repository
  // publishing a .qwizgroup never touches the rate-limited API at all.
  await expect(alert).toContainText(/rate-limiting/);
  await expect(alert).toContainText(/\.qwizgroup/);
});

test('GitHub being unreachable is reported as a connection problem', async ({ page }) => {
  await stubOffline(page);

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await expect(page.getByRole('alert')).toContainText(/Couldn't reach GitHub/);
});

test('a malformed pointer is told apart from a link with nothing in it', async ({ page }) => {
  const play = new PlayPage(page);

  await play.gotoRemote('/play?gist=nonsense', { start: false });
  await expect(page.getByRole('alert')).toContainText(/doesn't look like a gist/);

  await play.gotoRemote('/play?repo=nonsense', { start: false });
  await expect(page.getByRole('alert')).toContainText(/doesn't look like a repository/);

  // Unchanged behaviour for the original share link, which has no pointer at all.
  await play.gotoRemote('/play', { start: false });
  await expect(page.getByRole('alert')).toContainText(/doesn't have a quiz in it/);
});

test('a repo link that names no file inside it says so', async ({ page }) => {
  const play = new PlayPage(page);
  await play.gotoRemote('/play?repo=owner%2Frepo', { start: false });

  await expect(page.getByRole('alert')).toContainText(/not at a quiz file/);
});

test('a path that tries to climb out of the repository is refused before any request', async ({
  page
}) => {
  let requested = false;
  page.on('request', (request) => {
    if (request.url().includes('githubusercontent.com')) requested = true;
  });

  const play = new PlayPage(page);
  await play.gotoRemote('/play?repo=owner%2Frepo&path=..%2F..%2Fsecret.qwiz', { start: false });

  await expect(page.getByRole('alert')).toBeVisible();
  expect(requested).toBe(false);
});

test('every error still offers a way back to the visitor own quizzes', async ({ page }) => {
  await stubOffline(page);

  const play = new PlayPage(page);
  await play.gotoRemote(`/play?gist=${GIST_ID}`, { start: false });

  await page.getByRole('link', { name: 'Go to your own quizzes' }).click();
  await expect(page).toHaveURL(/\/$/);
});
