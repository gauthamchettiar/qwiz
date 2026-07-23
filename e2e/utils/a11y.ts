import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Runs an axe scan on the current page and fails the test if any serious or critical violation
 * is found. Moderate/minor findings are ignored here — they're worth knowing about but shouldn't
 * block every unrelated PR the way a serious/critical one should. */
export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}
