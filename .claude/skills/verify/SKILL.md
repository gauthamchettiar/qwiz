---
name: verify
description: Repo-specific recipe for driving the Qwiz app end-to-end with Playwright
---

# Verifying Qwiz changes

Qwiz is a static Astro + Svelte app. All trivia data lives in the browser's
`localStorage` — there is no backend.

## Launch

```
npx astro dev --background   # or: npx astro dev status / logs / stop
```

Runs at `http://localhost:4321`. Vite HMR picks up source edits automatically;
no rebuild needed between edits and a Playwright run.

## Playwright gotcha: one browser session per test run

`localStorage` is tied to the browser profile. Every `chromium.launch()` call
starts a **fresh, empty profile** — if you create a trivia in one script/process
and then launch a *new* browser in a later script to play it, the trivia is
gone ("No trivias yet"). Do build → save → play all with the **same `page`**
(or at least the same `browser`/context) in one script.

## Key flows

- **Create**: go to `/create`, click "Add question", pick a type from the
  `QuestionTypePicker` grid, fill in the prompt (`input[placeholder="Text"]`)
  and options (`input[placeholder="Option text"]`, points via
  `label:has-text("Points") input[type=number]`), then "Save to this browser".
  Save redirects to `/trivia?id=<uuid>` — grab the id from the URL.
- **Play**: go to `/trivia/play?id=<uuid>`. Click "Start" if an intro screen
  shows. Click option labels by their visible text to select them, then
  "Finish" to grade and show the score screen (`Your score`, per-question
  `X / Y pts`, per-option `+N pts` / `N pts available` / `N pts`).
- **Edit**: `/trivia/edit?id=<uuid>` reuses the same `TriviaBuilder`/
  `QuestionEditorCard` components as `/create`.

## Gotchas

- The per-question type switcher is the small pill button next to
  "Question N" (not a native `<select>`) — it opens an absolutely-positioned
  `QuestionTypePicker` dropdown. It needs an explicit width in its wrapper or
  the `sm:grid-cols-2` grid inside will overlap text (`QuestionEditorCard.svelte`).
- Only two question types are registered right now: `single` and `multiple`
  (`src/lib/question-types/registry.ts`).
