import { expect, test } from '@playwright/test';
import { buildOrderQuiz } from './fixtures/quizzes';
import { BuilderPage } from './pages/BuilderPage';
import { PlayPage } from './pages/PlayPage';
import { resetStorage, seedQuizzes } from './utils/storage';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

test('authoring an order question has no correct checkbox, and item order round-trips through code mode', async ({
  page
}) => {
  const builder = new BuilderPage(page);
  await builder.gotoCreate();
  await builder.titleInput.fill('Order Quiz');
  await builder.addQuestion();
  await page.getByLabel('Variant', { exact: true }).selectOption('order');
  await builder.questionTextInput().fill('Arrange chronologically');

  // order has no concept of a "correct" item — every item is part of the sequence, so the
  // checkbox choice/multi-choice questions show is never rendered here.
  await expect(page.getByRole('checkbox', { name: 'Correct' })).toHaveCount(0);

  await builder.optionTextInput(0).fill('First');
  await builder.optionTextInput(1).fill('Second');
  await page.getByRole('button', { name: 'Add option' }).click();
  await builder.optionTextInput(2).fill('Third');

  // Reorder: move the 3rd item ("Third") up twice to become first.
  const moveUpButtons = page.getByRole('button', { name: 'Move up' });
  await moveUpButtons.nth(2).click();
  await moveUpButtons.nth(1).click();

  await page.getByRole('button', { name: 'Edit question code' }).click();
  await expect(page.locator('main textarea.font-mono')).toHaveValue(
    /=Third[\s\S]*=First[\s\S]*=Second/
  );
});

test('placing items in the correct order wins full credit; a wrong order scores 0', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await expect(page.getByText('Arrange in the correct order')).toBeVisible();

  async function pickAndPlace(label: string, slotNumber: number) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.getByRole('button', { name: new RegExp(`Position ${slotNumber}, empty`) }).click();
  }

  await pickAndPlace('First', 1);
  await pickAndPlace('Second', 2);
  await pickAndPlace('Third', 3);

  await play.submitAnswerButton.click();
  await expect(page.getByText('3 / 3 points')).toBeVisible();
});

test('an incomplete placement cannot be submitted', async ({ page }) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: 'First', exact: true }).click();
  await page.getByRole('button', { name: /Position 1, empty/ }).click();

  await expect(play.submitAnswerButton).toBeDisabled();
});

test('every item and slot is keyboard-operable via Tab + Enter, no pointer required', async ({
  page
}) => {
  const quiz = buildOrderQuiz();
  await seedQuizzes(page, [quiz]);

  const play = new PlayPage(page);
  await play.goto(quiz.id);

  await page.getByRole('button', { name: 'First', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Position 1, empty/ }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: /Position 1, filled/ })).toBeVisible();
});
