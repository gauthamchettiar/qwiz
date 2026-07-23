import { expect, type Locator, type Page } from '@playwright/test';

export class HomePage {
  readonly page: Page;
  readonly newQuizLink: Locator;
  readonly importButton: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newQuizLink = page.getByRole('link', { name: '+ New Quiz' });
    this.importButton = page.getByRole('button', { name: 'Import Qwiz' });
    this.emptyState = page.getByText('No quizzes yet. Create one to get started.');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
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
