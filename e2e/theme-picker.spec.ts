import { expect, test } from '@playwright/test';
import { HomePage } from './pages/HomePage';
import { resetStorage } from './utils/storage';
import { expectNoSeriousA11yViolations } from './utils/a11y';

const PHONE = { width: 375, height: 667 };
const DESKTOP = { width: 1280, height: 800 };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await resetStorage(page);
});

// Viewports are set explicitly rather than left to the project, so each of these asserts the
// layout it names on all four projects instead of only the one whose default width happens to
// match.

test('on a phone the theme menu opens as a bottom sheet that fits on screen', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const home = new HomePage(page);
  await home.goto();
  await home.themeButton.click();

  await expect(home.themeMenu).toBeVisible();

  // The actual regression: anchored under a header button, thirteen themes ran off the bottom of
  // a phone viewport, and nothing could scroll to the part that overflowed.
  const box = await home.themeMenu.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);

  // A sheet, not a dropdown: flush to the bottom edge and spanning the full width.
  const sheet = await page.getByRole('heading', { name: 'Theme' }).boundingBox();
  expect(sheet).not.toBeNull();
  expect(sheet!.x).toBeLessThanOrEqual(16);
  expect(box!.width).toBeGreaterThan(PHONE.width * 0.9);
});

test('on a desktop viewport it stays a dropdown anchored under the button', async ({ page }) => {
  await page.setViewportSize(DESKTOP);
  const home = new HomePage(page);
  await home.goto();
  await home.themeButton.click();

  await expect(home.themeMenu).toBeVisible();
  // The sheet's own title bar is phone-only — its absence is what distinguishes the two layouts.
  await expect(page.getByRole('heading', { name: 'Theme' })).toBeHidden();

  const button = (await home.themeButton.boundingBox())!;
  const menu = (await home.themeMenu.boundingBox())!;
  expect(menu.y).toBeGreaterThanOrEqual(button.y);
  expect(menu.width).toBeLessThan(DESKTOP.width / 2);
});

test('picking a theme applies it and survives a reload', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const home = new HomePage(page);
  await home.goto();
  await home.themeButton.click();
  await home.themeOption('Dracula').click();

  await expect(home.themeMenu).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  await expect(home.themeButton).toHaveAccessibleName('Theme: Dracula');

  await home.goto();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dracula');
  await expect(home.themeButton).toHaveAccessibleName('Theme: Dracula');
});

test('the sheet closes on Escape, on its close button, and on a tap outside', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const home = new HomePage(page);
  await home.goto();

  await home.themeButton.click();
  await expect(home.themeMenu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(home.themeMenu).toBeHidden();

  await home.themeButton.click();
  await expect(home.themeMenu).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(home.themeMenu).toBeHidden();

  // Tapping the dimmed page above the sheet. The backdrop covers the whole viewport, but the
  // sheet sits on top of its lower half — so the tap has to be aimed at the part still exposed,
  // which is what a user reaching past the sheet actually hits.
  await home.themeButton.click();
  await expect(home.themeMenu).toBeVisible();
  await page
    .getByRole('button', { name: 'Close theme menu' })
    .click({ position: { x: 10, y: 10 } });
  await expect(home.themeMenu).toBeHidden();
});

test('the open sheet has no serious accessibility violations', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const home = new HomePage(page);
  await home.goto();
  await home.themeButton.click();
  await expect(home.themeMenu).toBeVisible();

  await expectNoSeriousA11yViolations(page);
});
