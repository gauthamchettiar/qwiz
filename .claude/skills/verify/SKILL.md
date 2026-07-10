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

## Routes

Routes are namespaced `/local/...` (localStorage-backed, always editable) vs
`/remote/...` (fetched live from a public GitHub repo's `quiz-data/` folder,
always read-only). No route works both ways — pick the namespace that
matches your data source.

- `/local/create` — new trivia (`?draft=<id>` resumes an autosaved draft)
- `/local/trivia?id=<uuid>` — detail page (Play/Edit/Delete/Download)
- `/local/trivia/edit?id=<uuid>` — edit, reuses `TriviaBuilder`
- `/local/trivia/play?id=<uuid>` — play
- `/remote/browse` — enter/pick a repo, links to `/remote/trivia?github=`
- `/remote/trivia?github=<owner>/<repo>` — lists that repo's trivias (no `id`)
- `/remote/trivia?github=<owner>/<repo>&id=<path>[&ref=<branch>]` — detail
  view for one trivia file (adding `id` switches the same page from listing
  to detail)
- `/remote/trivia/play?github=<owner>/<repo>&id=<path>[&ref=<branch>]` — play

## Key flows

- **Create**: go to `/local/create`, click "Add question", pick a type from
  the `QuestionTypePicker` grid, fill in the prompt (`input[placeholder="Text"]`)
  and options (`input[placeholder="Option text"]`, points via
  `label:has-text("Points") input[type=number]`), then "Save to this browser".
  Save redirects to `/local/trivia?id=<uuid>` — grab the id from the URL.
- **Play**: go to `/local/trivia/play?id=<uuid>` (or the `/remote/...`
  equivalent with `?github=&id=`). Click "Start" if an intro screen shows.
  Click option labels by their visible text to select them, then "Finish" to
  grade and show the score screen (`Your score`, per-question `X / Y pts`,
  per-option `+N pts` / `N pts available` / `N pts`).
- **Edit**: `/local/trivia/edit?id=<uuid>` reuses the same `TriviaBuilder`/
  `QuestionEditorCard` components as `/local/create`. Remote trivias aren't
  editable directly — "Clone" on the remote detail page copies it into
  localStorage and redirects to `/local/trivia/edit?id=` for the new copy.
- **Browse a repo**: `/remote/browse` → submit or "Load Example" navigates
  to `/remote/trivia?github=owner/repo`, which lists trivia groups; click one
  to land on the `&id=` detail view for that file.

## Gotchas

- The per-question type switcher is the small pill button next to
  "Question N" (not a native `<select>`) — it opens an absolutely-positioned
  `QuestionTypePicker` dropdown. It needs an explicit width in its wrapper or
  the `sm:grid-cols-2` grid inside will overlap text (`QuestionEditorCard.svelte`).
- Only two question types are registered right now: `single` and `multiple`
  (`src/lib/question-types/registry.ts`).
