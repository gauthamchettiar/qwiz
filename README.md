# Qwiz

A trivia quiz builder and player — fully static, frontend-only, with a modular question-type
architecture.

## Features

- **Rich question editor** — four grading variants (single/multiple × one-correct/graded), five
  option kinds (text, typed input, click-to-reveal, image, video), linked-input matching
  puzzles, prompt "extras" (hints, reveal-only content), list/grid display modes, and per-trivia
  settings (timers, reveal timing, win/lose thresholds, accent color, and more).
- **Focused player UI** — intro screen, running score, per-question/overall timers, answer
  reveal, and best-score tracking per browser.
- **No backend** — trivias you create are saved to your browser's `localStorage`. Nothing
  leaves your machine unless you explicitly download or import JSON.
- **Import / Export** — download any trivia as JSON, or import one from a file or pasted text.
  A downloadable JSON Schema documents the exact format.
- **Browse trivias hosted on GitHub** — point the Browse page at any public repo with a
  `quiz-data/` folder of trivia JSON, grouped by subfolder. Shareable links send a specific
  trivia straight to someone else's browser.

## Getting started

```
npm install
npm run dev
```

Then open http://localhost:4321.

```
npm run build      # outputs a fully static site to dist/
npm run preview    # preview the production build locally
```

No environment variables, no database, no server process — `astro build` produces plain
HTML/CSS/JS that can be deployed to any static host (GitHub Pages, Netlify, Vercel, S3, etc.).

## How trivias are stored

Everything you build or import is saved to `localStorage` in your browser only (key
`qwiz:trivias`). This means:

- Your trivias are private to your device/browser — clearing site data deletes them.
- There is no cross-device sync.
- **Download JSON** (on any trivia's detail page) is your backup and sharing mechanism — save
  the file somewhere durable, or hand it to someone else to **Import JSON** on their end.

In-progress edits to a not-yet-saved trivia are also autosaved locally as a draft
(`qwiz:drafts`), so an accidental tab close doesn't lose your work.

## Browsing trivias from GitHub

The `/browse` page can load and play trivias from any public GitHub repository, with zero
configuration on the repo's part beyond one convention:

> Put trivia JSON files under a `quiz-data/` folder at the root of your repo. Subfolders become
> groups on the Browse page — e.g. `quiz-data/sports/quiz.json` groups under "sports"; a file
> directly in `quiz-data/` groups under "General".

This repo's own [`quiz-data/`](./quiz-data) folder is a working example — Sports, 2025, Emoji,
and Movie quizzes, each showcasing a different mix of the question-type features above. Click
**Load Example** on the Browse page to load it directly.

Trivias loaded this way are read-only (Edit/Delete stay visible but disabled) — use **Download
JSON** if you want your own editable copy.

### Sharing a specific trivia

Every GitHub-hosted trivia has a **Copy share link** button on its detail page. The link
(`/trivia/play?github=owner/repo&id=path/to/file.json`) is self-contained — anyone who opens it
fetches and plays that trivia directly, with no prior visit to the Browse page required.

### Setting a default repo

`src/lib/githubConfig.ts` has a `DEFAULT_REPO` constant. Set it to `"owner/repo"` to have that
repo's trivias load automatically for every visitor to `/browse`, in addition to the manual
repo input.

## Project structure

```
src/
  pages/                    Astro routes (thin shells — most pages are client-rendered)
  layouts/Base.astro        Shared page chrome (header, nav)
  lib/
    types.ts                Core Trivia / TriviaSettings / QuestionInstance types
    store.ts                localStorage-backed CRUD for your own trivias
    drafts.ts, bestScore.ts Other localStorage-backed helpers
    github.ts                Fetches/validates/groups quiz-data/ from a GitHub repo (client-side)
    githubConfig.ts          DEFAULT_REPO constant
    resolveTrivia.ts         Resolves a trivia from URL params (local id, or github+id)
    triviaSchema.ts          Builds the Ajv JSON Schema used for import and GitHub validation
    question-types/          Plugin architecture — see below
    components/              Svelte islands (builder, player, browse UI, dialogs)
quiz-data/                   This repo's own example trivias (see "Browsing trivias" above)
```

### Question-type plugin architecture

Every question is `{ id, type, data }`, where `data`'s shape is owned entirely by its
registered type. Adding a new question type means adding a folder under
`src/lib/question-types/` implementing the `QuestionTypeDefinition` contract
(`src/lib/question-types/types.ts`) — `createDefault`, `validate`, `grade`, `dataSchema`, and
the `Editor` / `Player` / `AnswerSummary` / `Preview` Svelte components — then registering it in
`src/lib/question-types/registry.ts`. No other file needs to change: the JSON Schema, import
validation, and builder UI all pick up new types automatically from the registry.

Currently one type is registered: `choice` (`src/lib/question-types/choice/`), covering
single/multiple-select questions with four grading variants and five option kinds (text, input,
reveal, image, video), including linked-input matching puzzles.

## Tech stack

[Astro](https://astro.build) (static output) + [Svelte 5](https://svelte.dev) (runes) +
[Tailwind CSS v4](https://tailwindcss.com) + [Ajv](https://ajv.js.org) for JSON Schema
validation.
