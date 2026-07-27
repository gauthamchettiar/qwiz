import type { Locator, Page } from '@playwright/test';

/** Page Object for both /local/create and /local/edit, which render the same QuizBuilder. */
export class BuilderPage {
  readonly page: Page;
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly addQuestionButton: Locator;
  readonly saveButton: Locator;
  readonly downloadButton: Locator;
  readonly savedFlash: Locator;
  readonly deleteQuizButton: Locator;
  readonly confirmDeleteQuizButton: Locator;
  readonly notFoundMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.titleInput = page.getByLabel('Title', { exact: true });
    this.descriptionInput = page.getByLabel('Description', { exact: true });
    this.addQuestionButton = page.getByRole('button', { name: 'Add question' });
    this.saveButton = page.getByRole('button', { name: 'Save to this browser' });
    this.downloadButton = page.getByRole('button', { name: 'Download .qwiz' });
    this.savedFlash = page.getByText('Saved', { exact: true });
    this.deleteQuizButton = page.getByRole('button', { name: 'Delete quiz' });
    this.confirmDeleteQuizButton = page.getByRole('button', { name: 'Confirm delete quiz?' });
    this.notFoundMessage = page.getByText("That quiz couldn't be found.");
  }

  async gotoCreate(): Promise<void> {
    await this.page.goto('/local/create');
  }

  async gotoEdit(id: string): Promise<void> {
    await this.page.goto(`/local/edit?id=${id}`);
  }

  /** The Nth question card's own text field, once it's open in form mode (true right after
   * addQuestion(), since a freshly added question auto-focuses its text field). */
  questionTextInput(): Locator {
    return this.page.getByLabel('Question', { exact: true });
  }

  /** The Nth option row's text input within whichever question card is currently in form mode. */
  optionTextInput(index: number): Locator {
    return this.page
      .getByPlaceholder('Option text (or paste ![alt](image url) / ~[alt](video url))')
      .nth(index);
  }

  correctCheckbox(index: number): Locator {
    return this.page.getByRole('checkbox', { name: 'Correct' }).nth(index);
  }

  async addQuestion(): Promise<void> {
    await this.addQuestionButton.click();
  }

  /** Fills the currently-open question form's text and its first two options (already present
   * from QuizBuilder's BLANK_QUESTION_CODE seed: one correct, one not). */
  async fillChoiceQuestion(
    text: string,
    correctOption: string,
    wrongOption: string
  ): Promise<void> {
    await this.questionTextInput().fill(text);
    await this.optionTextInput(0).fill(correctOption);
    await this.optionTextInput(1).fill(wrongOption);
  }

  /** "Add setting" buttons, in DOM order — index 0 is always the quiz metadata card's own (it
   * renders before any question card), index 1+ are each open question form's, in order. */
  addSettingButton(index: number): Locator {
    return this.page.getByRole('button', { name: 'Add setting' }).nth(index);
  }

  /** A settings row's key <select>, in the same DOM order as `addSettingButton`. */
  settingKeySelect(index: number): Locator {
    return this.page.locator('select[aria-label="Setting key"]').nth(index);
  }

  settingValueInput(index: number): Locator {
    return this.page.getByPlaceholder('value').nth(index);
  }

  settingHelpButton(index: number): Locator {
    return this.page.getByRole('button', { name: 'What does this setting do?' }).nth(index);
  }
}
