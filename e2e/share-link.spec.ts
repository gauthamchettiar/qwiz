import { expect, test, type Page } from '@playwright/test';
import { buildQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes, simulateStorageFull, storedQuizCount } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

/** Authors and saves a quiz through the real builder UI, then returns its share link — the whole
 * point of the feature is that a link made from what an author actually wrote is playable, so this
 * path deliberately isn't shortcut through seeding. */
async function authorAndShare(page: Page): Promise<string> {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Shared Capitals');
  await builder.addQuestion();
  await builder.fillChoiceQuestion('What is the capital of France?', 'Paris', 'Lyon');
  // Saving a brand-new quiz redirects to its real /local/edit URL — that navigation is also what
  // clears the unsaved-changes guard, so the recipient half of these specs can navigate freely.
  await builder.saveButton.click();
  await expect(page).toHaveURL(/\/local\/edit\?id=.+/);
  return builder.shareLink();
}

test('a shared link plays the quiz without putting it in the recipient library', async ({
  page
}) => {
  const url = await authorAndShare(page);
  expect(url).toContain('/play#q=');

  // Everything after this point is the recipient: no quiz of this title exists in their browser.
  await resetStorage(page);

  const play = new PlayPage(page);
  await play.gotoShared(url, { start: false });
  await expect(page.getByRole('heading', { name: 'Shared Capitals', level: 1 })).toBeVisible();
  await expect(play.rulesHeading).toBeVisible();

  await play.start();
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await play.seeResultsButton.click();
  await expect(play.resultHeading()).toBeVisible();

  // Played end to end, and still nothing was written — a link someone opened is not a quiz they
  // asked to keep.
  expect(await storedQuizCount(page)).toBe(0);
});

test('a quiz can be shared straight from its card on the home page', async ({ page }) => {
  const quiz = buildQuiz();
  await seedQuizzes(page, [quiz]);

  const home = new HomePage(page);
  await home.goto();
  const url = await home.shareLink(quiz.title);
  expect(url).toContain('/play#q=');

  // Same link, same quiz — the list and the edit screen serialize a saved quiz through one
  // function (qwizSourceFromQuiz), so neither can drift into exporting a different document.
  await resetStorage(page);
  const play = new PlayPage(page);
  await play.gotoShared(url, { start: false });
  await expect(page.getByRole('heading', { name: quiz.title, level: 1 })).toBeVisible();

  await play.start();
  await play.choiceOption('Paris').click();
  await play.submitAnswerButton.click();
  await expect(page.getByText('Next question')).toBeVisible();
  expect(await storedQuizCount(page)).toBe(0);
});

test('Save a copy adds the shared quiz to the library, and it survives a reload', async ({
  page
}) => {
  const url = await authorAndShare(page);
  await resetStorage(page);

  const play = new PlayPage(page);
  await play.gotoShared(url, { start: false });

  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('button', { name: 'Saved to your quizzes' })).toBeDisabled();
  expect(await storedQuizCount(page)).toBe(1);

  const home = new HomePage(page);
  await home.goto();
  await home.expectListed('Shared Capitals');
});

test('Save a copy surfaces a storage failure instead of claiming success', async ({ page }) => {
  const url = await authorAndShare(page);
  await resetStorage(page);

  await simulateStorageFull(page);
  const play = new PlayPage(page);
  await play.gotoShared(url, { start: false });

  await page.getByRole('button', { name: 'Save a copy' }).click();
  await expect(page.getByRole('alert')).toContainText(/storage/i);
  await expect(page.getByRole('button', { name: 'Saved to your quizzes' })).toBeHidden();
});

test('a damaged link explains itself instead of rendering nothing', async ({ page }) => {
  const play = new PlayPage(page);

  await play.gotoShared('/play#q=1.thisisnotarealpayload', { start: false });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to your own quizzes' })).toBeVisible();
  await expect(play.startQuizButton).toBeHidden();
});

test('/play with no quiz in the link says so', async ({ page }) => {
  const play = new PlayPage(page);

  await play.gotoShared('/play', { start: false });
  await expect(page.getByRole('alert')).toContainText(/doesn't have a quiz in it/);
});

test('a quiz too big to fit in a link is refused rather than shared as a broken one', async ({
  page
}) => {
  // Embedded image data is the only thing that gets a .qwiz document anywhere near the limit, and
  // it's incompressible by construction — a repeating pattern would deflate away and prove nothing.
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let x = 123456789;
  const next = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
  const imageData = Array.from({ length: 80_000 }, () => ALPHABET.charAt(next() % 64)).join('');

  const quiz = buildQuiz({
    title: 'Enormous Picture Round',
    questions: [
      {
        id: 'q1',
        code: [
          `![A photograph](data:image/png;base64,${imageData})`,
          'What is shown here?',
          '{',
          '=A photograph',
          '~A drawing',
          '}'
        ].join('\n')
      }
    ]
  });
  await seedQuizzes(page, [quiz]);

  const builder = new BuilderPage(page);
  await builder.gotoEdit(quiz.id);
  await builder.openMoreActions();
  await builder.shareLinkButton.click();

  // No link at all — a URL that silently fails when pasted is worse than being told to send the
  // file. Download .qwiz has no size limit, so that's what the message points at.
  await expect(page.getByRole('alert')).toContainText(/too big to fit in a link/);
  await expect(page.getByText(/Download the .qwiz file/)).toBeVisible();
  await expect(builder.shareUrlInput).toBeHidden();
  await expect(builder.copyShareLinkButton).toBeHidden();
});
