import { defineConfig, devices } from '@playwright/test';

// Separate from playwright.config.ts so `pnpm test:e2e` never runs this: capturing screenshots
// writes files into docs/screenshots/ and has nothing to assert, so it would be both a slow no-op
// in CI and a source of spurious diffs. Run it deliberately, with `pnpm screenshots`, whenever the
// UI it documents changes.
//
// One project, one browser: these are documentation images, not a compatibility matrix.
export default defineConfig({
  testDir: './screenshots',
  // These run in sequence and share one storage origin; parallel workers would race on it.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:4321',
    ...devices['Desktop Chrome'],
    // Wide enough for the builder's two-column code mode (`md:` = 768px) but under `xl:` (1280px),
    // where a code-mode card deliberately breaks out to 150% width and would spill out of a crop.
    viewport: { width: 1152, height: 900 },
    // 1x keeps the whole set to a few hundred KB. 2x reads better for the small labels in a
    // settings row, but tripled the repo weight for images GitHub renders at ~880px wide anyway.
    deviceScaleFactor: 1
  },
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120_000
  }
});
