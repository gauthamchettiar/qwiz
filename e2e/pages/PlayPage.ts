import type { Locator, Page } from '@playwright/test';
import { waitForHydration } from '../utils/hydration';

export class PlayPage {
  readonly page: Page;
  readonly submitAnswerButton: Locator;
  readonly nextQuestionButton: Locator;
  readonly seeResultsButton: Locator;
  readonly typedAnswerInput: Locator;
  readonly playAgainButton: Locator;
  readonly reviewAnswersButton: Locator;
  readonly backToQuizzesLink: Locator;
  readonly notFoundMessage: Locator;
  readonly startQuizButton: Locator;
  readonly rulesHeading: Locator;
  readonly ruleItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.startQuizButton = page.getByRole('button', { name: 'Start quiz' });
    this.rulesHeading = page.getByRole('heading', { name: 'How this quiz works' });
    this.ruleItems = page.getByRole('listitem');
    this.submitAnswerButton = page.getByRole('button', { name: 'Submit answer' });
    this.nextQuestionButton = page.getByRole('button', { name: 'Next question' });
    this.seeResultsButton = page.getByRole('button', { name: 'See results' });
    this.typedAnswerInput = page.getByPlaceholder('Type your answer');
    this.playAgainButton = page.getByRole('button', { name: 'Play again' });
    this.reviewAnswersButton = page.getByRole('button', { name: 'Review answers' });
    this.backToQuizzesLink = page.getByRole('link', { name: 'Back to quizzes' });
    this.notFoundMessage = page.getByText("That quiz couldn't be found.");
  }

  /** Navigates and, by default, clicks through the welcome screen — `goto` has always meant "on
   * this quiz, ready to answer", and the fifty-odd specs that call it arrange a run in order to
   * test something else entirely. Pass `{ start: false }` where the welcome screen itself is the
   * subject (welcome-screen.spec.ts, the LeaveGuard case) or where there's no Start button to
   * click at all (the not-found id).
   *
   * The tradeoff, stated so it isn't a surprise: a page object with a behavioural default can hide
   * a screen from a spec that meant to see it. That's the cost of not editing every call site. */
  async goto(id: string, options: { start?: boolean } = {}): Promise<void> {
    await this.page.goto(`/local/play?id=${id}`);
    // Must stay before the click: `page.goto` resolves on `load`, and clicking Start is exactly
    // the handler-dependent interaction that silently does nothing on an unhydrated island.
    await waitForHydration(this.page);
    if (options.start !== false) await this.start();
  }

  async start(): Promise<void> {
    await this.startQuizButton.click();
  }

  /** Opens a shared `/play#q=…` link. Same hydration rule as `goto`, and the same `start` default;
   * the URL is absolute because it's whatever the share dialog actually produced. */
  async gotoShared(url: string, options: { start?: boolean } = {}): Promise<void> {
    await this.page.goto(url);
    await waitForHydration(this.page);
    if (options.start !== false) await this.start();
  }

  /** Opens a quiz published on GitHub — `/play?gist=…` or `/play?repo=…&path=…`.
   *
   * Unlike the other three, this one waits for the loading state to clear before touching Start:
   * hydration only means the island's JS has run, and here that island then goes to the network.
   * Without this wait a fast machine races the fetch and clicks a Start button that isn't rendered
   * yet. Specs whose subject IS the loading or error state pass `{ start: false }` and assert on
   * whatever they came for. */
  async gotoRemote(url: string, options: { start?: boolean } = {}): Promise<void> {
    await this.page.goto(url);
    await waitForHydration(this.page);
    if (options.start !== false) {
      await this.startQuizButton.waitFor({ state: 'visible' });
      await this.start();
    }
  }

  loadingMessage(): Locator {
    return this.page.getByText('Loading the quiz…');
  }

  gistFilePicker(): Locator {
    return this.page.getByRole('heading', { name: 'Which quiz?' });
  }

  progressLabel(): Locator {
    return this.page.getByText(/^Question \d+ of \d+$/);
  }

  choiceOption(text: string): Locator {
    return this.page.getByLabel(text, { exact: true });
  }

  resultHeading(): Locator {
    return this.page.getByRole('heading', { name: /You won!|Quiz complete/ });
  }
}
