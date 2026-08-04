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
  in a visitor's own browser, never at build time. `/play` is the same shape for a quiz that isn't
  in this browser at all: it reads a compressed `.qwiz` document out of the URL **fragment**
  (`#q=…`) and plays it from memory. The fragment, not a query string, is the whole point — it's
  never transmitted to the host, so a shared quiz stays as private as a stored one and isn't
  subject to any request-line length limit. See `lib/utils/shareLink.ts`.
- `/play` also accepts a **pointer** to a quiz published on GitHub — `?gist=<id>` or
  `?repo=<owner/name>&path=<file.qwiz>` — resolved at runtime by `lib/remote/`. These are query
  params, not a fragment, and the difference is deliberate rather than an oversight: the fragment
  rule exists to keep a quiz's _content_ off the wire, and a pointer names something already public
  on GitHub. There's no private document to leak, only a public one to name. What is given up is
  small and real — the host's access log learns which public quiz was opened — and that's the trade
  for a link that survives systems which strip fragments. A quiz that lives in the link itself still
  goes in the fragment, unchanged. See `lib/utils/remoteSource.ts`, which documents this in place.
- `/group?repo=<owner/name>[&path=<dir>]` browses a **collection** of quizzes published in a public
  repository, described by a `.qwizgroup` manifest (`docs/qwizgroup-format.md`,
  `lib/utils/quizGroup.ts`). The manifest is deliberately the SAME format as a `.qwiz` file —
  frontmatter fence, then blank-line-separated blocks — so it reuses `quizScript.ts`'s lexing and
  `validateSettingValue` rather than adding a YAML/TOML dependency and a second validation path.
  It parses just as strictly: an unknown key, or a key used in a mode it means nothing to, is an
  error.
  **The load order is the design.** A manifest listing its quizzes loads with **zero
  `api.github.com` calls** — every file comes from the unmetered raw host, and `HEAD` resolves the
  default branch server-side. Only a repo with no manifest (or `:discover=true`) spends the one
  recursive tree call, against a limit of 60/hour shared per IP. That difference is the whole reason
  to publish a manifest, it's what the rate-limit error points at, and it's asserted by tests in
  both `quizGroupSource.test.ts` and `repo-group.spec.ts` rather than left as a comment.
- **This means the app makes runtime network requests, which it did not before.** It reads public
  files from GitHub, signed out (`credentials: 'omit'`), and persists nothing unless the visitor
  presses "Save a copy". The user's own quizzes still never leave the browser — which is why
  `Base.astro`'s meta description says "your quizzes never leave your device" rather than the flat
  "nothing leaves your device" it used to claim. Keep that distinction exact in any user-facing copy.
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

### Playing: the welcome screen

**Every run starts on a welcome screen**, in `QuizPlayer.svelte` — the title, the description, and
a rules list derived from that quiz's own settings (`buildQuizRules` in `lib/utils/quizRules.ts`,
which is pure and framework-free, so it names an ICON rather than importing one; `QuizPlayer` owns
the one `Record<QuizRuleIcon, …>` that resolves them). It's gated by a `started` flag with no
author opt-out and no new setting, so there is exactly one entry path for both local and shared
quizzes.

The load-bearing part is that **no clock ticks before Start**: the per-question and per-quiz timer
`$effect`s are guarded on `!started`, and `LeaveGuard` is `started && !finished` (nothing has been
entered yet, so there's nothing to warn about). "Play again" deliberately does NOT return here.
Only rules that actually apply are emitted — a line per non-behaviour is the noise that makes
players skip the screen. `quizRules.test.ts` carries a coverage guard, in the spirit of
`settingsDoc.test.ts`: adding a key to `QUIZ_SETTING_RULES` fails it until someone decides whether
the welcome screen should mention it.

**All nine are skippable by default.** `canSubmitDraft` (grading.ts) leaves Submit live whatever
the draft holds — empty, half-finished or complete — and `require_answer=true` is the author's
opt-in to the old gate. Note it means complete AND non-empty: `isDraftComplete` alone accepts zero
selections on a choice question without `min_answers` (`0 >= 0`), so requiring an answer would
otherwise have gated nothing there. `min_answers` no longer blocks submission on its own; it only
defines what "complete" means for `require_answer` to enforce. A skipped question gets its own
`answerVerdict` of `'skipped'` (not `'incorrect'`) — derived from `isDraftEmpty`, never from a
zero score, since a fully-worked wrong answer scores zero too.

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
| E2E tests       | Playwright                                                                           | primary safety net — 660 tests (165 per project) across 4 browser projects |
| Unit tests      | Vitest                                                                               | pure logic in `src/lib/**` — 482 tests                                     |
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
│                                # qwizgroup-format.md (the .qwizgroup manifest — guarded by
│                                # groupDoc.test.ts the way settings.md is by settingsDoc.test.ts),
│                                # llm-reference.md (the whole format in one file, for a model)
│   └── screenshots/             # every image the README and docs reference — GENERATED, never
│                                # hand-captured; see screenshots/ below
├── examples/                    # *.qwiz files — the app's "Load a sample" list, loaded via
│                                # import.meta.glob ?raw; cover every variant and setting
│   └── group/                   # a worked .qwizgroup + the three quizzes it lists. NOT in the
│                                # sample list: that glob is examples/*.qwiz, non-recursive
├── e2e/                         # Playwright specs
│   ├── fixtures/                # quizzes.ts — buildQuiz() factory, sample .qwiz source
│   ├── pages/                   # Page Object Models: HomePage, BuilderPage, PlayPage
│   ├── utils/                   # storage.ts (seed/reset localStorage), a11y.ts (axe helper),
│   │                            # drag.ts (pointer-drag gesture), hydration.ts (island-ready wait)
│   └── *.spec.ts
├── public/                      # copied verbatim to dist/ root
│   ├── favicon.svg              # the Wordmark's four ransom-note chips, stacked 2x2 so they
│   │                            # survive 16px. Colours are the light theme's tokens resolved to
│   │                            # HEX — a favicon can't read global.css, so re-theming the
│   │                            # wordmark means editing this file too
│   ├── robots.txt               # Disallow: / — see §1, "Deliberately not indexed"
│   └── _headers                 # Cloudflare Pages security headers (CSP, etc.) — see §5
├── src/
│   ├── components/
│   │   └── svelte/              # every interactive island (.svelte) — no astro/ subfolder yet,
│   │                             # since nothing here is a static zero-JS component today
│   ├── layouts/
│   │   └── Base.astro           # page shell: header (logo, Import, + New), <main><slot /></main>
│   ├── lib/                     # framework-agnostic TS: pure logic, no Svelte imports
│   │   ├── schemas/quiz.ts      # zod Quiz/QuizQuestion schemas; Quiz/QuizDraft types derive from them
│   │   ├── stores/               # the only files that touch localStorage. quizzes.ts
│   │   │                         # (list/get/save/delete), theme.ts, groupProgress.ts (journey
│   │   │                         # progress, keyed by repo + manifest entry id — never by quiz id,
│   │   │                         # which is regenerated on every remote load)
│   │   ├── remote/               # THE ONLY PLACE THAT CALLS fetch — same one-side-effect-per-folder
│   │   │                         # rule as stores/ and localStorage. github.ts (gist/tree/raw
│   │   │                         # requests, result types, never throws), quizSource.ts (resolve a
│   │   │                         # QuizSourceRef to .qwiz text), quizGroupSource.ts (the
│   │   │                         # manifest-first load sequence). Every DECISION these make lives
│   │   │                         # in utils/githubRef.ts so it's testable without a network.
│   │   └── utils/                # quizScript.ts (parser/serializer), grading.ts, shuffle.ts,
│   │                             # youtube.ts, download.ts, suggestions.ts, sampleQuizzes.ts,
│   │                             # numericInput.ts, quizRules.ts (the welcome screen's rules
│   │                             # list), shareLink.ts (compress a quiz into a URL fragment),
│   │                             # githubRef.ts (parse gist/repo pointers, build GitHub URLs, the
│   │                             # fetch-error taxonomy), remoteSource.ts (what /play's URL points
│   │                             # at), quizGroup.ts (the .qwizgroup parser + its rules tables),
│   │                             # folderTree.ts, repoIndex.ts (a repo with no manifest becomes
│   │                             # the same QuizGroup type), qwizDocument.ts (a saved Quiz -> .qwiz source; the inverse
│   │                             # of importQwiz.ts), clickOutside.ts, dragDrop.ts,
│   │                             # questionFocus.ts
│   ├── pages/
│   │   ├── index.astro          # quiz list
│   │   ├── 404.astro            # custom not-found page, matches the app's own visual language
│   │   ├── play.astro           # SharedQuizPlayPage, client:only — a quiz decoded from `#q=`, or
│   │   │                        # fetched from a gist/repo pointer. Deliberately NOT under local/,
│   │   │                        # which means "from this browser's storage"
│   │   ├── group.astro          # QuizGroupPage, client:only — a .qwizgroup collection in a repo
│   │   └── local/
│   │       ├── create.astro     # QuizBuilder, client:load
│   │       ├── edit.astro       # QuizEditPage, client:only (reads ?id= at runtime)
│   │       └── play.astro       # QuizPlayPage, client:only (reads ?id= at runtime)
│   └── styles/global.css        # Tailwind import + @theme tokens + the app's ~3 lines of custom CSS
├── screenshots/                 # capture.spec.ts — writes docs/screenshots/*.png. Deliberately
│                                # OUTSIDE e2e/ so `pnpm test:e2e` never runs it (see §7)
├── .github/workflows/ci.yml
├── astro.config.mjs
├── eslint.config.js
├── playwright.config.ts
├── playwright.screenshots.config.ts
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
- Persisted state → only `src/lib/stores/*` calls `localStorage` (`quizzes.ts` for the quiz
  library, `theme.ts` for the colour theme, plus the pre-paint theme script in `Base.astro`, which
  has to be inline to beat first paint). Never call `localStorage` from a component — this is enforced by convention, not tooling, so
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
3. **A design token** added to `@theme` in `src/styles/global.css` — every colour in the app is
   one (see "Colour and themes" below), plus `--font-sans`.
4. **Custom CSS** — last resort. `global.css` currently has exactly two: a `cursor: pointer`
   restore on `<button>` (Tailwind's preflight resets it) and a 16px floor on form controls at
   coarse pointers (iOS auto-zoom). Both are commented with why. `color-scheme` is no longer one
   of them — it's per theme now.

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
- **Never name a palette shade outside `global.css`.** `bg-slate-50`, `text-indigo-600` and the
  like don't appear anywhere in `src/` any more — every colour is a semantic token
  (`bg-surface`, `text-ink-subtle`, `border-line`, `bg-positive-surface`). That's what makes a
  theme a block of CSS variables instead of a hunt through 34 components, and it's enforced by
  reading: a `slate-` in a component diff is a bug. See "Colour and themes" below.
- **Contrast**: `text-ink-faint` fails WCAG AA against this app's surfaces (2.51:1 in the light
  theme, needs 4.5:1) — confirmed by the Playwright a11y suite. Use `text-ink-subtle` for any
  text-bearing element that needs a muted look; `ink-faint`/`ink-ghost` are only safe on icon-only
  buttons and purely decorative icons, which convey no text for axe to check.
- Repeated utility strings across components → extract a component, not an `@apply` block.
  `@apply` is effectively banned (the two `global.css` exceptions above are structural CSS, not
  component styling).
- Never add a `dark:` variant. Dark mode is real now, but it is NOT `dark:` — see below.
- Keyboard focus must always be visible. Respect `prefers-reduced-motion` for any new animation
  (existing `fade` transitions in `QuizBuilder`/`QuizPlayer` are brief enough not to need a
  reduced-motion fallback, but a longer one would).

### Colour and themes

Every colour is a semantic token defined once in `src/styles/global.css` and overridden per theme:

- `surface` / `surface-raised` / `-hover` / `-sunken` / `-strong` / `-inverse` — things you put
  content ON.
- `ink` / `-muted` / `-soft` / `-subtle` / `-faint` / `-ghost` — text, furthest from the
  background to closest. `ink-inverse` is text on a solid accent/positive/negative/warning fill;
  `ink-on-inverse` is text on `surface-inverse`. Those two are genuinely different jobs and
  flip independently per theme — collapsing them is what produced dark-on-mid-tone buttons the
  first time round.
- `line` / `-faint` / `-subtle` / `-strong` — borders.
- `accent`, `positive`, `negative`, `warning`, each with `-surface`, `-ink` and `-line` families.

**Adding a theme is one block of CSS variables** under `:root[data-theme='…']` plus an entry in
`THEMES` (`lib/stores/theme.ts`) and one in `accessibility.spec.ts`'s per-theme loop. No component
changes: Tailwind v4 compiles `bg-surface` to
`background-color: var(--color-surface)`, so overriding the variable re-skins every usage. This is
why there are no `dark:` variants — they'd be a second set of class names to keep in sync, and
they can't express thirteen themes anyway.

Rules that come with it:

- **`color-scheme` per theme is not optional.** It's what makes native chrome (`<select>` popups,
  scrollbars) legible; a dark theme without it renders the setting-key dropdown unreadably.
- **Contrast is enforced, not assumed.** `e2e/accessibility.spec.ts` runs axe over the builder and
  a revealed answer in _every_ theme. Adding a theme means adding it to that loop. Two real
  pre-existing failures surfaced when this was first added (a white-on-green score badge at
  3.21:1, and error text on its own tint at 4.36:1) — both invisible to the old suite because no
  test had ever visited a revealed answer.
- **The theme is applied before first paint** by a small inline script in `Base.astro`, not by the
  picker island — an island only runs after hydration, by which point a dark-theme visitor has
  already seen a white flash. That script deliberately restates a few lines of `lib/stores/theme.ts`
  rather than importing it, because importing a module is exactly what would make it non-blocking.

### The `.qwiz` source editors

`CodeEditor.svelte` is used by both the whole-document editor and a question card's code mode. It's
a real `<textarea>` with a highlighted `<pre>` layered UNDER it and the textarea's own text made
transparent — not a contenteditable, and not an editor library. That keeps native undo/redo, IME
composition, spellcheck and mobile text selection, all of which a bespoke editor reimplements
badly, and it adds no dependency.

The contract between the two layers is the thing to be careful with:

- **They must occupy identical space to the pixel**, or the caret drifts off the glyphs beneath it.
  Everything affecting text metrics (font, size, line height, padding, wrapping, tab size) is set
  once, from the single `LAYER` string, on both.
- **`highlightQwiz` must reproduce its input exactly.** Joining a line's token texts always gives
  back the line, character for character. `qwizHighlight.test.ts` asserts this over every line of
  every example file plus half-typed fragments — it's the invariant the overlay rests on, so it's
  tested rather than assumed.
- **The tokenizer never requires valid source.** It's a line tokenizer with two bits of carried
  context (inside the frontmatter fence, inside a `{ }` block), because an editor mostly contains
  source that doesn't parse yet.
- **Token colours are semantic tokens**, never palette shades, so an editor follows the active
  theme like everything else.

The whole-document editor additionally shows a **live preview** beside the source at `xl:` and up.
It renders the last APPLIED document, not the draft — re-rendering per keystroke would flash a wall
of parse errors through half of every edit. Ctrl+S applies without closing (the preview catches up,
the caret stays put); the tick applies and closes. The preview scrolls to whichever question the
caret is in, derived from the draft's own blank-line-separated block structure rather than from
`questions`, since those two disagree the moment anything is typed.

### Share links (`lib/utils/shareLink.ts`)

A whole `.qwiz` document, deflated and base64url'd into `/play#q=<version>.<payload>`. Points that
are decisions, not incidentals:

- **Compression is `CompressionStream('deflate-raw')`**, the platform's own — no dependency, per
  §2. The cost, stated because it's real: encode/decode are async, and it needs Safari 16.4+ /
  Firefox 113+ / Chrome 103+.
- **The payload carries a version digit** so a future format change is rejected with a real message
  instead of decoding into garbage. The three failure modes (wrong version, malformed base64,
  failed inflate) get three distinct messages, because they ask different things of the reader.
- **A shared quiz is never auto-saved.** `SharedQuizPlayPage` builds it via `quizFromQwizSource`
  (the non-persisting half of `importQwiz.ts`) and plays it from memory; "Save a copy" is the opt
  in, and it goes through `importQwizSource` like every other import. `share-link.spec.ts` asserts
  the library is still empty after a full play-through — a UI assertion can't tell "not persisted"
  from "persisted but not shown".
- **Length is a hard gate, not just a warning.** `shareUrlVerdict` returns `ok` / `long` (past
  `SHARE_URL_WARN_LENGTH`, where chat clients and mail gateways start truncating — warn and hand it
  over) / `too-long` (past `SHARE_URL_MAX_LENGTH`, where browsers stop accepting URLs — refuse
  outright and point at Download `.qwiz`). A URL that silently fails when pasted is worse than
  being told to send the file. Only embedded base64 image data actually gets a quiz there, which is
  why the unit and e2e tests both build that case from an xorshift PRNG: a repeating pattern
  deflates away and would prove the opposite of the point.
- The size verdict lives in the dialog, not on the menu item that opens it — a document's
  compressed length isn't knowable without compressing it.
- **`qwizSourceFromQuiz` (qwizDocument.ts) is the only way a SAVED quiz becomes a document.**
  Share and Download, from both the quiz list and the edit screen, all go through it, so they can't
  drift into exporting subtly different documents for the same quiz. Not to be confused with
  `QuizBuilder`'s own `currentDocumentForExport`, which serializes live, possibly-unsaved form
  state and therefore genuinely can't share that code path.

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

`connect-src` names three GitHub hosts — `api.github.com`, `raw.githubusercontent.com` and
`gist.githubusercontent.com` — and nothing else. This is the only widening the CSP has ever had, and
it's what makes loading a quiz from a gist or repo possible at all; before it, `connect-src 'self'`
blocked those requests outright. Each host earns its place: the API for gist contents and the one
recursive tree call used to discover quizzes in a repo without a `.qwizgroup`, the raw host for
every `.qwiz`/`.qwizgroup` document (unmetered, which is why all content comes from there), and the
gist raw host only for gist files over ~1MB, which the API returns truncated with a `raw_url`
instead of inline content. Named individually rather than as a blanket `https:` for the same reason
`frame-src` is: this is the complete set of hosts the app can reach, and a new one appearing in a
diff should have to justify itself. **A `connect-src` violation surfaces in the app as an
indistinguishable "Couldn't reach GitHub"** — identical to being offline — so if remote loading
breaks with no obvious cause, check this line first.

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
- The app makes external requests of exactly two kinds, and **both must always be stubbed** — no
  spec may depend on anything being reachable from CI:
  - The YouTube iframe a `!<youtube>` media line renders (see `extractYoutubeId`), used by the
    picture-round example. `e2e/utils/network.ts`'s `stubExternalEmbeds` fulfils it with a blank
    local page.
  - GitHub, when playing a gist or a repo quiz. `e2e/utils/github.ts` has `stubGist`, `stubRepo`,
    `stubRateLimited`, `stubNotFound` and `stubOffline`, plus `countApiCalls` for asserting the
    manifest-first path spends none of the metered 60/hr budget.
    Fulfil rather than abort wherever a 200 is the point (a blocked request is itself a console
    error), and **reproduce GitHub's real CORS headers** — `stubGist`/`stubRepo` send
    `Access-Control-Expose-Headers` because a cross-origin response hides every non-safelisted header
    from JS without it. A stub that omits it makes `x-ratelimit-remaining` unreadable and silently
    degrades the rate-limit message, which looks exactly like an app bug and isn't one. This cost a
    real debugging round; don't remove it.
- A test that asserts "no console errors" must scope that to the app's own origin
  (`isAppConsoleMessage`). A third-party frame's logging says nothing about this app and isn't ours
  to fix — Firefox reports YouTube's rejected cross-site cookie as an _error_, which failed CI while
  the app worked perfectly, and it reproduced on no other browser.
- Page Object Models in `e2e/pages/` — locators and actions live there, assertions live in specs.
- **`PlayPage.goto` clicks through the welcome screen by default** (`{ start: false }` opts out).
  That's how one page-object change absorbed the ~56 call sites that all mean "on this quiz, ready
  to answer". The tradeoff, named rather than hidden: a behavioural default in a page object can
  hide a screen from a spec that meant to see it, so the opt-outs are explicit and documented in
  its JSDoc. `gotoShared` is the same shape for a `/play#q=…` link.
- When fixing a bug: write the failing test first, then fix it. State in the response which test
  now covers the regression.

### Documentation screenshots (`screenshots/capture.spec.ts`)

Every image the README and `docs/` reference is **generated**, by `pnpm screenshots`. The three
that predate this were captured by hand and had silently gone stale — the builder one showed a
version of the option row that no longer existed, which is exactly the failure mode a generated
image can't have.

It's a Playwright spec, but deliberately not part of the suite: it lives outside `e2e/` and runs
under its own `playwright.screenshots.config.ts` (one chromium project, `deviceScaleFactor: 1`,
a viewport wide enough for code mode's two columns but under the `xl:` breakout). It asserts
nothing, so running it in CI would only write files nobody reads.

Rules for it:

- **Re-run it after any UI change a documented screen would show, and commit the diff.** A doc
  screenshot showing a control that no longer exists is worse than no screenshot.
- Everything nondeterministic is pinned, so a re-run with no UI change produces a byte-identical
  image and an empty diff. Keep it that way — anything unpinned puts a spurious binary diff in
  every commit that touches this. Four separate sources had to be nailed down, and all four are
  live: `shuffle_questions`/`shuffle_options` off plus a fixed `createdAt`; a seeded stand-in for
  `Math.random` (the four `ALWAYS_SHUFFLED_VARIANTS` boards shuffle regardless of
  `shuffle_options`, by design); `animations: 'disabled'`, since most boards are captured
  mid-interaction with a transition still running; and `caret: 'hide'` plus an explicit `blur()`
  on the one shot that leaves a field focused.
- Every image goes through `shotPadded`, which clips a padded rectangle out of a full-page
  screenshot rather than calling `locator.screenshot()`. An element screenshot clips to the border
  box, which put each card's own border flush against the image edge and cut the import dialog's
  shadow off entirely; the padded clip fills that gutter with the real page background. It takes
  several locators where the subject isn't one box — a question card's action strip is
  `lg:absolute lg:right-full`, so it renders outside the card's own bounding box.
- Content reads like a real quiz, not like a fixture. These images are the first thing anyone sees
  of the app; `e2e-quiz-1` in a README is worse than no README.
- Prefer an element or region crop over a full-page one, and capture boards **mid-answer** — an
  untouched `match_pairs` board doesn't show what pairing looks like, which is the whole point.
- `docs/llm-reference.md` stays text-only by design: it exists to be handed to a model as a single
  self-contained document, and images are dead weight in that context.

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
pnpm screenshots        # regenerate docs/screenshots/*.png — see §7
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
- [ ] `localStorage` touched only from `src/lib/stores/` (`quizzes.ts`, `theme.ts`,
      `groupProgress.ts`)
- [ ] `fetch` called only from `src/lib/remote/` — and always `credentials: 'omit'`, with a
      timeout, returning a result rather than throwing
- [ ] Any new persistence call checks `saveQuiz`/`deleteQuiz`'s boolean return and surfaces a
      failure to the user (see §6) — never assumes a write landed
- [ ] Works at mobile viewport, keyboard navigable, axe-clean (`pnpm test:e2e` covers all three)

### Anti-patterns — flag these on sight

Adding an SSR adapter · a new `localStorage` call outside `lib/stores/` · a `fetch` outside
`lib/remote/` · a `fetch` without `credentials: 'omit'` · calling
`saveQuiz`/`deleteQuiz` without checking the result · `@apply` blocks · naming a palette shade
(`slate-500`, `indigo-600`) anywhere but `global.css` · a `dark:` variant · `text-ink-faint` on
real text · `waitForTimeout` in tests · CSS-class selectors in tests · duplicated `.qwiz`
parsing/validation logic outside `quizScript.ts` · `any` · a component that only renders the
happy path · e2e tests running against `pnpm dev` instead of the build · re-adopting
daisyUI/Bits UI wholesale without re-reading §2's reasoning first.
