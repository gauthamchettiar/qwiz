# CLAUDE.md

Operating manual for any Claude instance working in this repository.
Read this fully before writing code. When a request conflicts with this file, say so and ask.

This file is adapted from a generic static-Astro-site template to this project's actual, current
state — not aspirational. If a rule below stops matching reality (a new dependency, a moved
file), update this file in the same commit that causes the drift.

---

## 1. What this project is

Qwiz — a **fully static, client-side-only Astro site** for authoring and playing quizzes. No
server runtime, no SSR, no API routes, no secrets at runtime. Everything (quizzes, drafts,
settings) lives in the visitor's own browser via `localStorage`; nothing is synced anywhere.

Hard constraints — never violate without explicit approval:

- `output: 'static'` (see `astro.config.mjs`). **Never** add an SSR adapter (`@astrojs/node`,
  `vercel`, `cloudflare` serverless, etc.).
- No `.astro` server endpoints (`src/pages/**/*.ts` returning `APIRoute`), no
  `Astro.request`-dependent logic, no `export const prerender = false`.
- Anything dynamic happens in the browser: `fetch`, `localStorage`, `crypto.randomUUID`. The
  `/local/edit` and `/local/play` routes read a quiz id from `?id=` at runtime and render
  `client:only="svelte"` — there is no dynamic route to prerender, since quiz ids only ever exist
  in a visitor's own browser, never at build time.
- The build output in `dist/` must be servable from any dumb static host with no config beyond
  SPA-ish handling. Currently deployed to **Cloudflare Pages** (see §8) — no `base`/subpath
  config needed there, unlike GitHub Pages.
- No environment variable may contain a secret. Only `PUBLIC_*` vars exist, and they are public by
  definition. (None are currently in use.)

If a task genuinely requires a server, **stop and say so**. Propose the smallest possible external
primitive rather than converting the project to SSR.

**Deliberately not indexed.** `<meta name="robots" content="noindex">` (`Base.astro`) and
`public/robots.txt` both disallow crawling. Since every quiz lives only in one visitor's own
`localStorage`, a crawler hitting `/local/edit`/`/local/play` would just see the not-found state —
there's no shared content anywhere for indexing to be useful. If the app ever grows something
genuinely public (a shareable read-only quiz link, say), revisit both.

### The nine question variants

The format's variant keywords are all `verb_object`, so the set reads as one vocabulary and no name
collides with an ordinary identifier (the old `order`/`match` were unsearchable against
`optionOrder`/`matchTypedGuesses`):

`pick_one` · `pick_many` · `type_answer` · `type_pattern` · `guess_letters` · `order_items` ·
`match_pairs` · `group_items` · `fill_blanks`

Renamed from `single_choice`/`multiple_choice`/`typed`/`character_input`/`order`/`match`/
`categorise`/`fill_in_blanks` **with no backward-compatibility aliases**, by explicit decision — a
quiz saved under the old keywords reports `Unknown variant` and has to be re-authored. Don't add an
alias map without asking; the clean break is the point.

`type_pattern` is the one variant whose `=`/`~` markers are both load-bearing (`=` patterns define
correct, `~` patterns mark a response explicitly wrong). Every other typed variant forces every
option `correct: true` at parse time.

---

## 2. Stack

| Concern         | Choice                                                                               | Notes                                                                      |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Framework       | Astro 7                                                                              | static output, islands architecture                                        |
| Interactive UI  | Svelte 5 (runes)                                                                     | `$state`, `$derived`, `$effect`, `$props` — no legacy stores API           |
| Styling         | Tailwind CSS v4 (`@tailwindcss/vite`)                                                | no `tailwind.config.js`; theme lives in CSS via `@theme`                   |
| Components      | Hand-rolled Tailwind, no component library                                           | see §5 — daisyUI/Bits UI were evaluated and deliberately not adopted       |
| Icons           | `@lucide/svelte`                                                                     |                                                                            |
| Validation      | zod                                                                                  | schemas in `src/lib/schemas/`; types derive via `z.infer`                  |
| Language        | TypeScript, `strict: true`                                                           | `astro/tsconfigs/strict` as base, plus a `@/*` path alias                  |
| Package manager | pnpm                                                                                 | lockfile committed (`pnpm-lock.yaml`), `--frozen-lockfile` in CI           |
| E2E tests       | Playwright                                                                           | primary safety net — 424 tests (106 per project) across 4 browser projects |
| Unit tests      | Vitest                                                                               | pure logic in `src/lib/**` — 328 tests                                     |
| Lint / format   | ESLint (flat config) + Prettier + `prettier-plugin-astro` + `prettier-plugin-svelte` |                                                                            |
| Deploy          | Cloudflare Pages                                                                     | via GitHub Actions, see §8                                                 |

Version numbers drift. Before pinning anything, check the installed version in `package.json` and
the actual API in `node_modules`, not memory.

**Do not add a dependency without asking.** State what it solves, its install size, and what it
replaces. Prefer stdlib/platform APIs (`URL`, `structuredClone`, `Intl`, `AbortController`) over
packages.

### Why no daisyUI / Bits UI

A generic version of this file recommends daisyUI (pre-styled components) and Bits UI (headless,
accessible primitives) as the default before hand-rolling markup. Evaluated against this specific
codebase and rejected: the existing hand-rolled components (`Button`, `Dialog`, `CardMenu`,
`ConfirmDeleteButton` in `src/components/svelte/`) are already small (40–80 lines each), already
use accessible native elements (`Dialog` wraps `<dialog>` + `showModal()`, which gets focus
trapping and Escape-to-close for free from the browser), and encode app-specific interaction
patterns (the two-step delete confirm, the suggestion-dropdown arrow-key handling) that no library
would provide anyway. Adopting either would add two dependencies and a migration pass without
reducing line count or complexity. **If this calculus changes** (new components that would
genuinely benefit from headless accessibility primitives — a combobox, a real dropdown menu with
roving tabindex), re-evaluate Bits UI specifically for that component rather than a wholesale
migration.

---

## 3. Project structure

```
.
├── docs/                        # introduction.md, qwiz-format.md, settings.md,
│                                # llm-reference.md (the whole format in one file, for a model)
├── examples/                    # *.qwiz files — the app's "Load a sample" list, loaded via
│                                # import.meta.glob ?raw; cover every variant and setting
├── e2e/                         # Playwright specs
│   ├── fixtures/                # quizzes.ts — buildQuiz() factory, sample .qwiz source
│   ├── pages/                   # Page Object Models: HomePage, BuilderPage, PlayPage
│   ├── utils/                   # storage.ts (seed/reset localStorage), a11y.ts (axe helper),
│   │                            # drag.ts (pointer-drag gesture), hydration.ts (island-ready wait)
│   └── *.spec.ts
├── public/                      # copied verbatim to dist/ root
│   ├── favicon.svg
│   ├── robots.txt               # Disallow: / — see §1, "Deliberately not indexed"
│   └── _headers                 # Cloudflare Pages security headers (CSP, etc.) — see §5
├── src/
│   ├── components/
│   │   └── svelte/              # every interactive island (.svelte) — no astro/ subfolder yet,
│   │                             # since nothing here is a static zero-JS component today
│   ├── layouts/
│   │   └── Base.astro           # page shell: header (logo, Import, + New Quiz), <main><slot /></main>
│   ├── lib/                     # framework-agnostic TS: pure logic, no Svelte imports
│   │   ├── schemas/quiz.ts      # zod Quiz/QuizQuestion schemas; Quiz/QuizDraft types derive from them
│   │   ├── stores/quizzes.ts    # the only file that touches localStorage — list/get/save/delete
│   │   └── utils/                # quizScript.ts (parser/serializer), grading.ts, shuffle.ts,
│   │                             # youtube.ts, download.ts, suggestions.ts, sampleQuizzes.ts,
│   │                             # numericInput.ts,
│   │                             # importQwiz.ts, clickOutside.ts, dragDrop.ts,
│   │                             # questionFocus.ts
│   ├── pages/
│   │   ├── index.astro          # quiz list
│   │   ├── 404.astro            # custom not-found page, matches the app's own visual language
│   │   └── local/
│   │       ├── create.astro     # QuizBuilder, client:load
│   │       ├── edit.astro       # QuizEditPage, client:only (reads ?id= at runtime)
│   │       └── play.astro       # QuizPlayPage, client:only (reads ?id= at runtime)
│   └── styles/global.css        # Tailwind import + @theme tokens + the app's ~3 lines of custom CSS
├── .github/workflows/ci.yml
├── astro.config.mjs
├── eslint.config.js
├── playwright.config.ts
├── vitest.config.ts
└── CLAUDE.md
```

Rules:

- **Pages are thin.** A page composes a layout and one top-level Svelte island, passes props, does
  nothing else. All of this project's pages already follow this — if a page grows logic, move it
  to the island or to `src/lib/`.
- **Logic lives in `src/lib/` and is framework-free.** Every non-trivial function in `lib/utils/`
  and `lib/stores/` is unit-tested (see `*.test.ts` siblings). Svelte components are the
  _presentation_ of that logic, never the owner of it — e.g. `QuizPlayer.svelte` calls
  `gradeDraft`/`gradeRun` from `lib/utils/grading.ts` rather than scoring anything itself.
- Use the `@/*` path alias (`tsconfig.json` → `"@/*": ["src/*"]`). No `../../../` imports — the
  only relative imports left in the codebase are Svelte components importing siblings in the same
  `components/svelte/` folder (`import Button from './Button.svelte'`), which is intentional.
- Colocation: `clickOutside.ts` and `questionFocus.ts` live in `lib/utils/` (not beside the
  components that use them) because they're plain, framework-agnostic action/type helpers with no
  Svelte import of their own — promote a helper out of a component folder the moment a second
  component needs it too.

---

## 4. Astro + Svelte rules

**Default to `.astro`.** Every Svelte island ships JS to the user. This app is unusual: nearly
every page's primary content genuinely IS the interactive island (an authoring form, a player, a
localStorage-backed list) rather than a static page with an interactive widget bolted on — so
`client:load`/`client:only` dominate here, not `client:visible`/`client:idle`. That's a
deliberate, load-bearing decision for _this_ app, not a license to reach for `client:load` by
default elsewhere. A future addition that's genuinely below-the-fold or non-critical (e.g. a
"recently played" widget) should still use the lighter directives below.

Hydration directives, in order of preference for anything NEW:

| Directive              | Use when                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| _(none)_               | Static markup — the default                                                                                                |
| `client:visible`       | Below-the-fold interactive widgets                                                                                         |
| `client:idle`          | Interactive but not immediately needed                                                                                     |
| `client:load`          | Above-the-fold and immediately interactive (current: `QuizList`, `QuizBuilder` on `/local/create`, `ImportQuizDialog`)     |
| `client:only="svelte"` | Component **cannot** render on the server — reads `?id=`/`localStorage` at mount (current: `QuizEditPage`, `QuizPlayPage`) |

`client:only` skips SSR-time rendering entirely and produces layout shift — used deliberately on
the two id-driven pages above, each of which renders nothing until `onMount` resolves whether the
quiz exists.

State:

- Component-local state → runes inside the component.
- State shared **within one island tree** → props / context (e.g. `QuizBuilder` → `QuestionCard` →
  `QuestionForm`, all via props/callbacks).
- State shared **across separate islands** → none currently exists in this app (every route
  hydrates exactly one top-level island; there's no cross-island communication). If that changes,
  follow the original template's guidance: a module in `src/lib/stores/*.svelte.ts` exporting
  rune-backed state, not DOM/custom-event coupling between islands.
- Persisted state → `src/lib/stores/quizzes.ts` is the **only** file that calls `localStorage`.
  Never call `localStorage` from a component — this is enforced by convention, not tooling, so
  watch for it in review.
- A writable `$derived` (Svelte 5) is the pattern this app uses for "read once, then let local
  interactions override it" state — see `QuizList.svelte`'s `quizzes` — instead of the
  `$state` + `$effect` pair that used to do the same thing less directly.

Every island must handle the states that are actually reachable for it. This app's convention:
`{#if quiz} ... {:else if notFound} ... {/if}` for the two id-driven pages, and an explicit empty
state (`QuizList`'s "No quizzes yet") wherever a list can legitimately be empty. A component that
only renders the happy path is incomplete.

---

## 5. Styling — Tailwind utilities, no component library

See §2 for why daisyUI/Bits UI aren't in use. The actual escalation ladder in this codebase:

1. **Tailwind utilities** directly in markup — the overwhelming majority of styling.
2. **A shared component** in `src/components/svelte/` once a pattern repeats — `Button.svelte`
   (variant/size props over a class-string lookup), `Dialog.svelte` (shared modal shell),
   `ConfirmDeleteButton.svelte` (the two-step delete pattern used on both quiz cards and
   questions), `CardMenu.svelte` (the "⋮" overflow menu).
3. **A design token** added to `@theme` in `src/styles/global.css` — currently just
   `--font-sans`; the app hasn't needed more.
4. **Custom CSS** — last resort. `global.css` currently has exactly two: `color-scheme: light`
   (the app is a fixed light palette, not dark-mode-aware — this prevents the OS's dark-mode UA
   styles from rendering `<datalist>`-style native chrome unreadably) and a `cursor: pointer`
   restore on `<button>` (Tailwind's preflight resets it). Both are commented with why.

Additional rules:

- No arbitrary values (`w-[437px]`) except genuine one-offs like the code-mode breakout width in
  `QuestionCard.svelte`, which is commented explaining the specific math.
- **Never layer two conflicting class strings and expect the later one to win.** Which of
  `bg-indigo-50` and `bg-green-50` applies is decided by their order in the generated stylesheet,
  not by their order in the `class` attribute — so a "base look, then an override on top" pair
  silently resolves whichever way Tailwind's palette happens to be ordered. This produced two real
  bugs: a choice option the player got RIGHT rendered as merely "selected" (indigo won over green),
  and a correctly-placed `order` slot rendered a green background inside a slate border (slate won
  over green). Anything with several mutually-exclusive looks picks exactly one via a function
  returning a single class string — see `choiceOptionTone` in `QuestionPlayer.svelte` and the
  `slotTone`/`leftTone`/`rightTone`/`itemTone`/`blankTone` helpers in the four boards.
- Color palette is `slate` (neutral surfaces/text) + `indigo` (the one primary accent) +
  semantic `red`/`green`/`amber` for destructive/correct/warning states. No daisyUI semantic
  tokens (`bg-base-200`) since there's no theme-switching to abstract over.
- **Contrast**: `text-slate-400` on this app's light backgrounds (`slate-50`/white) fails WCAG AA
  (2.51:1, needs 4.5:1) — confirmed by the Playwright a11y suite. Use `text-slate-500` (4.5–4.8:1)
  for any text-bearing element that needs a muted look; `slate-400` is only safe on icon-only
  buttons and purely decorative icons, which convey no text for axe to check.
- Repeated utility strings across components → extract a component, not an `@apply` block.
  `@apply` is effectively banned (the two `global.css` exceptions above are structural CSS, not
  component styling).
- Dark mode: explicitly out of scope (`color-scheme: light`) — don't add `dark:` variants without
  discussing the tradeoff first, since it's a real product decision, not just a CSS change.
- Keyboard focus must always be visible. Respect `prefers-reduced-motion` for any new animation
  (existing `fade` transitions in `QuizBuilder`/`QuizPlayer` are brief enough not to need a
  reduced-motion fallback, but a longer one would).

### Security headers (`public/_headers`)

Cloudflare Pages reads this file verbatim. `script-src`/`style-src` include `'unsafe-inline'`
because Astro's islands runtime injects a small inline `<script>`/`<style>` on every page — that's
Astro's architecture, not something app code controls, and this codebase has no `{@html}` or other
raw-HTML sink for a stricter `script-src` to actually be defending against. The other directives
(`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`) don't have
that conflict and stay strict. `img-src` allows any `https:` origin because an option/media image
URL is arbitrary author-pasted input (see `QuizScriptOptionContent` in `quizScript.ts`) — there's
no fixed set of image hosts to allow-list. `frame-src` is scoped to `https://www.youtube.com` only,
matching the one embed the app ever renders (`extractYoutubeId` in `lib/utils/youtube.ts`).

---

## 6. DRY and code quality

- **Rule of three**: duplicate once, extract on the third occurrence — or immediately if the
  duplication is logic rather than markup.
- One source of truth per concept. `Quiz`/`QuizQuestion` types derive from `quizSchema`
  (`z.infer`), not hand-written twice. `QuizScriptSettings`/`SETTING_RULES` in
  `lib/utils/quizScript.ts` are the single validation path both code-mode parsing and form-mode
  fields go through — see that file's own extensive doc comments before touching it.
- Functions in `src/lib/utils/` are pure: inputs → outputs, no ambient state, no `window` access.
  The one exception by design is `lib/stores/quizzes.ts`, which exists specifically to own the
  `localStorage` side effect so nothing else has to.
- **Parse, don't validate**: `lib/stores/quizzes.ts`'s `readAll()` runs every record read from
  `localStorage` through `quizSchema.safeParse` and drops anything that doesn't match (logging a
  `console.warn`), so a hand-edited or stale-schema value in a visitor's browser can't crash the
  app downstream. Follow this pattern for any new localStorage-backed state.
- **`saveQuiz`/`deleteQuiz` return `boolean`, and every call site checks it.** `writeAll` catches
  whatever `localStorage.setItem` throws (quota exceeded — real here, since a quiz can embed
  base64 image data; Safari private browsing, which throws on every write) and reports failure
  rather than letting it propagate as an uncaught exception. `QuizBuilder.svelte`'s
  `buildAndSaveQuiz`/`deleteThisQuiz`, `QuizList.svelte`'s `removeQuiz`, and
  `importQwiz.ts`'s `importQwizSource` all surface a message via the existing `ErrorList`
  component on failure instead of optimistically assuming the write landed — a save/delete that
  silently didn't happen is worse than one that visibly failed. Any new code that persists a quiz
  must do the same, not just call `saveQuiz(quiz)` and move on.
- Errors: `parseQuizScriptQuestion`/`parseQwizFile` etc. return `{ result, errors }` shapes rather
  than throwing — user-authored `.qwiz` source is expected to sometimes be invalid, and that's not
  a programmer error. Reserve `throw` for actual programmer error.
- No `any`, no `@ts-ignore` (use `@ts-expect-error` with a reason if truly unavoidable), no
  non-null `!` on values that can genuinely be null. `astro check` and the ESLint
  `@typescript-eslint` rules enforce most of this; `no-unused-expressions` specifically flags the
  Svelte "reference a value inside `$effect` purely to track it as a dependency" pattern — prefix
  those with `void` (see `QuizBuilder.svelte`'s category/tag-highlight-reset effects) rather than
  disabling the rule.
- Naming: predicates start `is/has/can` (`isTypedMatch`, `isDraftComplete`); async or
  action-shaped functions read as actions (`saveQuiz`, not `quizData`). Files kebab-case except
  Svelte components (PascalCase, matching the exported component name) and TS modules that export
  one primary named thing camelCase (`quizScript.ts`, `grading.ts`).
- Comments explain **why**, never what — this codebase already does this extensively and well
  (e.g. `grading.ts`'s doc comments on why `cappedPositiveSum` exists). Match that density and
  intent for new code; don't add comments that just restate the code.
- Keep diffs small and reviewable. Do not reformat or "clean up" files you weren't asked to touch.

---

## 7. Testing

### Unit tests (Vitest) — `src/lib/**/*.test.ts`

Pure logic only: `grading.test.ts`, `quizScript.test.ts` (including parse → serialize → parse
round-trips for every question/frontmatter shape, and every validation error path),
`shuffle.test.ts`, `youtube.test.ts`, `download.test.ts`, `importQwiz.test.ts`,
`numericInput.test.ts`, `settingsDoc.test.ts` (keeps `docs/settings.md`'s tables honest against
`SETTING_RULES`/`QUIZ_SETTING_RULES` — keys, accepted values, defaults and inheritance, in both
directions; the same idea as `llmReference.test.ts`), and
`stores/quizzes.test.ts` (the one file that needs `// @vitest-environment jsdom` for a real
`localStorage`, since everything else runs in plain `node`).

**Node's own experimental global `localStorage`** (Node 22+, throws without
`--localstorage-file`, shadows jsdom's working one) is why `pnpm test`/`pnpm test:watch` run with
`NODE_OPTIONS=--no-experimental-webstorage` (via `cross-env` for cross-platform env vars — see
`package.json`). Don't remove that flag; without it, every jsdom-environment test using
`localStorage` fails with `localStorage.setItem is not a function`. This is also why
`lib/stores/quizzes.ts` checks `typeof window === 'undefined'` rather than
`typeof localStorage === 'undefined'` to detect SSR — the latter is no longer reliably `true`
during Astro's build on modern Node.

Run: `pnpm test` (once) / `pnpm test:watch`.

**Coverage gate**: `pnpm test:coverage` runs the same suite with `@vitest/coverage-v8`, scoped to
`src/lib/**` only (`vitest.config.ts`'s `coverage.include` — Svelte components are intentionally
excluded, since they're covered by e2e instead, not unit tests). `coverage.thresholds` enforces
80% on statements/branches/functions/lines; Vitest exits non-zero if any metric falls short, which
is what makes this an actual gate rather than a number nobody looks at. CI's `unit` job runs
`pnpm test:coverage`, not plain `pnpm test`, so a coverage regression fails the build same as a
failing test. Current numbers sit around 91% — `sampleQuizzes.ts` (static data, nothing to cover)
and `clickOutside.ts`/`suggestions.ts` (untested but real logic) are the only files at 0%, and
don't threaten the aggregate; `download.ts`'s `downloadTextFile` is deliberately excluded from
unit coverage since it's a browser-side-effect function (Blob/DOM), covered by e2e instead.

`dragDrop.ts` is the one file with an explicit `/* v8 ignore start */` block, wrapping its
`draggable` action and `buildGhost` for the same reason, but stated in the file since it's large
enough to have moved the aggregate ~10 points on its own: pointer capture, `elementFromPoint`
hit-testing and a ghost element in the document are things jsdom doesn't implement, so a unit test
would only be asserting against mocks of the APIs under test. Its _decisions_ are factored out into
pure exported helpers (`exceedsDragThreshold`, `findDropZone`, `dragActivation`) which ARE unit
tested, and the gesture itself is covered in a real browser by `e2e/drag-and-drop.spec.ts`. Reach
for `v8 ignore` only on that same basis — untestable-by-construction browser plumbing whose logic
has been extracted out of it — never to get a number up.

### E2E tests (Playwright) — `e2e/`

The primary contract for user-visible behavior. Config (`playwright.config.ts`):

- `webServer` runs `pnpm build && pnpm preview` locally — tests always run against the **real
  static build**, never `astro dev`. In CI, it runs just `pnpm preview` against a `dist/`
  downloaded from the `build` job's artifact, so e2e never silently tests a differently-built copy
  than what `build` produced.
- Projects: `chromium`, `firefox`, `webkit`, `mobile` (`Pixel 5`).
- `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video: 'retain-on-failure'`.
- `fullyParallel: true`, `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`.

### Selector policy

1. Role-based: `getByRole('button', { name: 'Save changes' })` — preferred, tests a11y for free.
2. `getByLabel`, `getByPlaceholder`, `getByText` for content.
3. `data-testid` — not currently used anywhere; the app's markup has been accessible enough that
   role/label selectors always sufficed. Reach for it only when the above are genuinely ambiguous.
4. **Never** CSS/XPath selectors tied to Tailwind classes or DOM shape — the one deliberate
   exception is `e2e/keyboard.spec.ts`'s `main textarea.font-mono` locator, which needs a stable
   way to distinguish the code-mode editor from two other textareas that share the page at
   different times (the header's always-mounted import dialog, and the Description field once
   Escape reveals it) — documented inline with why.

### Arranging state: seed via localStorage, exercise via the UI

`e2e/utils/storage.ts`'s `seedQuizzes()`/`resetStorage()` write/clear `qwiz:quizzes` directly,
bypassing the builder UI, to arrange state for specs that test something _other_ than authoring
(playing, listing, deep-linking). `simulateStorageFull()` in the same file overrides
`Storage.prototype.setItem` to throw (via `page.addInitScript`, so it's in place before the app's
own code runs) — used by `create-quiz.spec.ts`/`list-and-delete.spec.ts` to verify the app
actually surfaces a save/delete failure (see §6's `saveQuiz`/`deleteQuiz` boolean-return rule)
instead of claiming success. `e2e/fixtures/quizzes.ts`'s `buildQuiz()` is the one place that
builds a schema-valid `Quiz` fixture — pin `settings.shuffle_questions: false` on any fixture a
test asserts a specific question order against, since it defaults to `true`.

The one thing genuinely under test — authoring — is always driven through the real UI
(`e2e/create-quiz.spec.ts`), never shortcut via seeding.

### What every new feature needs covered

- Happy path, end to end, as a user would perform it.
- Empty/not-found state where one is reachable (`notFound` on the id-driven pages, `QuizList`'s
  empty state).
- Persistence: reload the page and assert state survived (`create-quiz.spec.ts`,
  `list-and-delete.spec.ts`, `deep-link.spec.ts` all do this — it's the app's core promise).
- Keyboard behavior for anything with real custom keyboard logic (the category/tag
  suggestion-dropdown arrow-key handling in `QuizBuilder.svelte`; Escape out of code mode) — not
  generic Tab-order checks, since there's no custom tab management in this app to verify.
- Pointer gestures, if any, driven through `page.mouse` rather than Playwright's `dragTo` — see
  `e2e/utils/drag.ts`'s `dragOnto`, which presses, moves past the drag threshold in steps, and
  releases, because the app promotes a press into a drag on the first move past that threshold (see
  `lib/utils/dragDrop.ts`). The tap path for the same board must stay covered alongside it: the two
  mechanics share one state machine, and a change to either can silently break the other.
- Mobile viewport: covered automatically by the `mobile` Playwright project running every spec, not
  by separate mobile-only specs.
- Accessibility: `e2e/accessibility.spec.ts` runs `@axe-core/playwright` on every major screen via
  `e2e/utils/a11y.ts`'s `expectNoSeriousA11yViolations` — fails on any `serious`/`critical`
  violation. It's what caught the color-contrast issue documented in §5; treat a new failure from
  it as a real bug, not a test to loosen.

### Discipline

- **Never** `waitForTimeout`. Use web-first assertions (`await expect(locator).toBeVisible()`).
- Don't run `pnpm build` (or anything that rebuilds `dist/`) while a Playwright run is in flight.
  `playwright.config.ts` sets `reuseExistingServer` locally, so a stray `astro preview` from an
  earlier run gets reused and a concurrent build rewrites `dist/` underneath it — which surfaces as
  a scatter of unrelated 30s timeouts that vanish on re-run. Kill port 4321 first if in doubt.
- Tests are independent: every spec's `beforeEach` navigates to `/` and calls `resetStorage`.
- **Never interact with an island before it hydrates.** `page.goto` resolves on `load`, which is
  before the island's JS has run, so a keystroke can land on an element with no handlers attached
  yet — and `fill()` still appears to work, because Playwright sets the value directly. Only
  handler-dependent interactions (pressing Enter, clicking a button) silently do nothing, which is
  why this reproduced about 1 run in 12 and only in one spec. The page objects' `goto*` methods all
  call `waitForHydration` (`e2e/utils/hydration.ts`, which waits for `astro-island[ssr]` to
  disappear); any new navigation helper must do the same.
- The app makes exactly one external request: the YouTube iframe a `!<youtube>` media line renders
  (see `extractYoutubeId`), which the picture-round example uses. **Stub it** —
  `e2e/utils/network.ts`'s `stubExternalEmbeds` fulfils it with a blank local page, so no spec
  depends on youtube.com being reachable from CI. Any future `fetch` gets the same treatment via
  `page.route()`; never hit anything real from CI.
- A test that asserts "no console errors" must scope that to the app's own origin
  (`isAppConsoleMessage`). A third-party frame's logging says nothing about this app and isn't ours
  to fix — Firefox reports YouTube's rejected cross-site cookie as an _error_, which failed CI while
  the app worked perfectly, and it reproduced on no other browser.
- Page Object Models in `e2e/pages/` — locators and actions live there, assertions live in specs.
- When fixing a bug: write the failing test first, then fix it. State in the response which test
  now covers the regression.

---

## 8. CI/CD

`.github/workflows/ci.yml`, triggered on push to `main` and on every PR:

1. **verify** — `astro check` (types), `eslint .`, `prettier --check .`
2. **unit** — `pnpm test:coverage` (Vitest, enforcing the 80% coverage gate — see §7)
3. **build** — `astro build`, uploads `dist/` as an artifact
4. **e2e** — depends on `build`; downloads its `dist/` artifact (never rebuilds), installs
   Playwright browsers (cached by lockfile hash), runs the full 4-project suite; uploads
   `playwright-report/` on failure with `if: always()`
5. **deploy** — depends on all four above, only runs on `push` to `main`, deploys the `build`
   job's artifact to **Cloudflare Pages** via `cloudflare/wrangler-action`
   (`command: pages deploy dist --project-name=qwiz`), scoped to a `production` `environment:`.
   `cloudflare/pages-action` (the previous action here) is deprecated upstream with no newer
   release — `wrangler-action` is its maintained successor, hence the switch.

Rules already in place:

- `verify`/`unit`/`build` run in parallel (no `needs:` between them); only `e2e` and `deploy`
  declare dependencies.
- `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` —
  superseded runs on the same branch are cancelled.
- Each job's `permissions:` block is least-privilege (`contents: read` almost everywhere;
  `deployments: write` only on `deploy`).
- A red CI is never "probably flaky." Investigate or quarantine explicitly with a linked issue.
- All pinned Action versions (`actions/checkout`, `actions/setup-node`, `actions/cache`,
  `actions/upload-artifact`, `actions/download-artifact`, `pnpm/action-setup`) and
  `env.NODE_VERSION` are kept at their latest major. `.github/dependabot.yml` covers the
  `github-actions` and `npm` ecosystems on a weekly schedule, opening a PR whenever a newer
  version lands, for a human to review and merge or close.

**Possibly not yet done — needs a human to confirm**: whether a Cloudflare Pages project literally
named `qwiz` (`--project-name=qwiz` in the `wrangler pages deploy` command) exists, and whether the
`deploy` job's `secrets.CLOUDFLARE_API_TOKEN`/`secrets.CLOUDFLARE_ACCOUNT_ID` are set, isn't
knowable from the repo itself. The repo has a GitHub remote (`origin` → `gauthamchettiar/qwiz`) and
`main` is pushed and in sync with `origin/main`. If `deploy` hasn't run successfully yet: create
the Cloudflare Pages project, and add the two secrets (Settings → Secrets and variables → Actions)
plus a `production` environment if you want extra protection rules on it.

---

## 9. Commands

```bash
pnpm dev              # dev server
pnpm build            # static build → dist/
pnpm preview           # serve dist/ (what e2e tests run against)
pnpm check            # astro check — types + template diagnostics
pnpm lint             # eslint .
pnpm format            # prettier --write .
pnpm format:check      # prettier --check .
pnpm test              # vitest run
pnpm test:watch        # vitest (watch mode)
pnpm test:coverage      # vitest run --coverage — enforces the 80% gate, see §7
pnpm test:e2e           # playwright test
pnpm test:e2e:ui        # playwright test --ui  (debugging)
```

---

## 10. Working agreement for Claude

- **Plan before coding.** For anything beyond a trivial edit, state the approach in a few bullets —
  files touched, components added, tests added — and wait for a go-ahead. Do not dump a large
  implementation unprompted.
- **Push back on complexity.** If the request can be satisfied with less machinery, say so. This
  file's own §2 (daisyUI/Bits UI) is the model: a real evaluation, a real "no," documented so the
  next session doesn't re-litigate it from scratch.
- **Don't guess APIs.** Check `package.json`, read the actual source in `node_modules`, or ask.
- **Surface tradeoffs, don't bury them.** If a choice has a real cost (bundle size, hydration,
  a11y, browser support), name it in one line.
- **Leave the repo runnable.** Never commit or hand over code that fails `pnpm check`, `pnpm
lint`, `pnpm test`, or `pnpm test:e2e`.
- Explain _why_ alongside _what_ — the reasoning is more valuable than the diff.

### Definition of done

- [ ] Types pass (`pnpm check`), lint and format clean
- [ ] Vitest covers any new pure logic in `src/lib/`
- [ ] Playwright specs cover the new happy path + empty/not-found + persistence, at minimum
- [ ] No new custom CSS beyond a token, or a comment justifying it
- [ ] No new dependency without prior agreement
- [ ] `text-slate-400` never used on text-bearing elements (see §5) — `text-slate-500`+ instead
- [ ] Still fully static: no adapter, no server route, no runtime secret
- [ ] `localStorage` touched only from `src/lib/stores/quizzes.ts`
- [ ] Any new persistence call checks `saveQuiz`/`deleteQuiz`'s boolean return and surfaces a
      failure to the user (see §6) — never assumes a write landed
- [ ] Works at mobile viewport, keyboard navigable, axe-clean (`pnpm test:e2e` covers all three)

### Anti-patterns — flag these on sight

Adding an SSR adapter · a new `localStorage` call outside `lib/stores/quizzes.ts` · calling
`saveQuiz`/`deleteQuiz` without checking the result · `@apply` blocks · `text-slate-400` on real
text · `waitForTimeout` in tests · CSS-class selectors in tests · duplicated `.qwiz`
parsing/validation logic outside `quizScript.ts` · `any` · a component that only renders the
happy path · e2e tests running against `pnpm dev` instead of the build · re-adopting
daisyUI/Bits UI wholesale without re-reading §2's reasoning first.
