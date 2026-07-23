import type { Locator, Page } from '@playwright/test';

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

  constructor(page: Page) {
    this.page = page;
    this.submitAnswerButton = page.getByRole('button', { name: 'Submit answer' });
    this.nextQuestionButton = page.getByRole('button', { name: 'Next question' });
    this.seeResultsButton = page.getByRole('button', { name: 'See results' });
    this.typedAnswerInput = page.getByPlaceholder('Type your answer');
    this.playAgainButton = page.getByRole('button', { name: 'Play again' });
    this.reviewAnswersButton = page.getByRole('button', { name: 'Review answers' });
    this.backToQuizzesLink = page.getByRole('link', { name: 'Back to quizzes' });
    this.notFoundMessage = page.getByText("That quiz couldn't be found.");
  }

  async goto(id: string): Promise<void> {
    await this.page.goto(`/local/play?id=${id}`);
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
