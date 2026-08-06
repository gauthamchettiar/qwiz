import { expect, type Locator, type Page } from '@playwright/test';
import { waitForHydration } from '../utils/hydration';

export class HomePage {
  readonly page: Page;
  readonly newButton: Locator;
  readonly newQuizMenuItem: Locator;
  readonly newGroupMenuItem: Locator;
  readonly importButton: Locator;
  readonly emptyState: Locator;
  readonly themeButton: Locator;
  readonly themeMenu: Locator;

  constructor(page: Page) {
    this.page = page;
    // "+ New" used to be a plain link straight to /local/create; it's a dropdown now that there
    // are two things to create, so opening it is a separate step from picking an item.
    this.newButton = page.getByRole('button', { name: 'New', exact: true });
    this.newQuizMenuItem = page.getByRole('menuitem', { name: 'New quiz' });
    this.newGroupMenuItem = page.getByRole('menuitem', { name: 'New group' });
    // `exact` because the import dialog's own "Validate & Import" button is a substring match on
    // "Import" the moment the dialog is open.
    this.importButton = page.getByRole('button', { name: 'Import', exact: true });
    this.emptyState = page.getByText('No quizzes yet. Create one to get started.');
    // The label carries the current theme ("Theme: System"), so match the prefix rather than a
    // name that changes the moment a test picks something.
    this.themeButton = page.getByRole('button', { name: /^Theme:/ });
    this.themeMenu = page.getByRole('menu');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await waitForHydration(this.page);
  }

  async openNewQuiz(): Promise<void> {
    await this.newButton.click();
    await this.newQuizMenuItem.click();
  }

  async openNewGroup(): Promise<void> {
    await this.newButton.click();
    await this.newGroupMenuItem.click();
  }

  themeOption(label: string): Locator {
    return this.page.getByRole('menuitemradio', { name: label, exact: true });
  }

  card(title: string): Locator {
    return this.page
      .getByRole('link')
      .filter({ has: this.page.getByRole('heading', { name: title }) });
  }

  async openCardMenu(title: string): Promise<void> {
    await this.page.getByRole('button', { name: `Actions for "${title}"` }).click();
  }

  /** The "Play" item in whichever card menu is currently open — call after openCardMenu(). */
  playMenuItem(): Locator {
    return this.page.getByRole('link', { name: 'Play' });
  }

  downloadMenuItem(): Locator {
    return this.page.getByRole('button', { name: 'Download .qwiz' });
  }

  shareMenuItem(): Locator {
    return this.page.getByRole('button', { name: 'Share link' });
  }

  /** Opens a card's ⋮ → Share link and returns the URL the dialog built. Waits for the field
   * rather than reading it straight away, since compression is async. */
  async shareLink(title: string): Promise<string> {
    await this.openCardMenu(title);
    await this.shareMenuItem().click();
    const input = this.page.getByLabel('Share link');
    await input.waitFor();
    return input.inputValue();
  }

  deleteMenuItem(): Locator {
    return this.page.getByRole('button', { name: 'Delete', exact: true });
  }

  confirmDeleteMenuItem(): Locator {
    return this.page.getByRole('button', { name: 'Confirm delete?' });
  }

  async expectListed(title: string): Promise<void> {
    await expect(this.card(title)).toBeVisible();
  }

  async expectNotListed(title: string): Promise<void> {
    await expect(this.card(title)).toHaveCount(0);
  }
}
