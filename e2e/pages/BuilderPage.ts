import type { Locator, Page } from '@playwright/test';
import { waitForHydration } from '../utils/hydration';

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
  /** The page-level whole-document editor beside Play. `exact` matters: the metadata card and every
   * question card have their own "Edit quiz code"/"Edit question code" buttons, which a substring
   * match on "Code" also picks up. */
  readonly fileCodeButton: Locator;
  readonly fileSourceInput: Locator;

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
    this.fileCodeButton = page.getByRole('button', { name: 'Code', exact: true });
    this.fileSourceInput = page.getByLabel('Quiz .qwiz source');
  }

  // Both wait for hydration: the builder is an island, and a test that starts typing into
  // server-rendered markup before its handlers attach is racing (see `waitForHydration`).
  async gotoCreate(): Promise<void> {
    await this.page.goto('/local/create');
    await waitForHydration(this.page);
  }

  async gotoEdit(id: string): Promise<void> {
    await this.page.goto(`/local/edit?id=${id}`);
    await waitForHydration(this.page);
  }

  /** The Nth question card's own text field, once it's open in form mode (true right after
   * addQuestion(), since a freshly added question auto-focuses its text field). */
  questionTextInput(): Locator {
    return this.page.getByLabel('Question', { exact: true });
  }

  /** Adds an option of `kind` through the "Add option" menu — an icon trigger plus a menu, so it's
   * two steps rather than one button per kind. `rowNoun` differs per variant ("Add accepted
   * answer" on the typed ones), but only the variants offering a kind choice route through here. */
  async addOption(kind: 'Text' | 'Image' | 'Video' = 'Text'): Promise<void> {
    await this.page.getByRole('button', { name: 'Add option' }).click();
    await this.page.getByRole('menuitem', { name: kind, exact: true }).click();
  }

  /** The Nth option row's text input within whichever question card is currently in form mode.
   * `exact`, because an image option's own fields ("alt text", "url") share this list and a
   * substring match on a shorter placeholder could reach them. */
  optionTextInput(index: number): Locator {
    return this.page.getByPlaceholder('Option text', { exact: true }).nth(index);
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

  /** The "Settings" disclosure toggles, in the same DOM order as `addSettingButton` — index 0 is
   * the quiz metadata card's, 1+ each open question form's. */
  settingsToggle(index: number): Locator {
    return this.page.getByRole('button', { name: /^Settings/ }).nth(index);
  }

  /** Opens a settings disclosure if it isn't already open. Every settings control below lives
   * inside that panel, and it starts collapsed on a quiz/question that has no settings yet — so
   * arranging any settings state has to go through here first. Idempotent, because a card whose
   * quiz already HAS settings renders it open. */
  async openSettings(index: number): Promise<void> {
    const toggle = this.settingsToggle(index);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }

  /** "Add setting" buttons, in DOM order — but counting only panels that are OPEN. A collapsed
   * disclosure's contents are out of the accessibility tree entirely, so they don't occupy an
   * index here: with only a question's settings expanded, that question's button is index 0, not
   * 1. Open what you need via `openSettings` (whose own indices ARE stable, since every toggle is
   * always rendered) and count from there. The same rule applies to `settingKeySelect` and
   * `settingValueInput`. */
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

  /** A key in an open settings block's legend — the key name IS the help trigger now, so there's
   * no separate "?" button per row to reach for. */
  settingHelpKey(key: string): Locator {
    return this.page.getByRole('button', { name: key, exact: true });
  }
}
