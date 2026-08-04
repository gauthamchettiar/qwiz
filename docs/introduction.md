# Introduction

Qwiz builds and plays quizzes entirely in your browser. There's no account, no server, and no
sync — every quiz you create is saved to your browser's `localStorage` and never leaves your
device. Clearing your browser's site data for this domain deletes your quizzes; there's no
recovery beyond a `.qwiz` file you've exported yourself (see [Import & export](#import--export)).

## Core concepts

- **A quiz** is a title, description, category, tags, a list of questions, and a set of scoring
  settings (win threshold, shuffling, reveal timing, etc.).
- **A question** is one of nine variants — `pick_one`, `pick_many`, `type_answer`, `type_pattern`,
  `guess_letters`, `order_items`, `match_pairs`, `group_items` and `fill_blanks`. Some are picked,
  some typed, and four are placed on a board:

  ![Sorting items into buckets](./screenshots/variant-group-items.png)

  See [the format reference](./qwiz-format.md) for the full syntax of all nine, each with a
  screenshot of how it plays.

- **Everything round-trips through one format**: the `.qwiz` plain-text format is both what you
  can hand-write in code mode and what gets exported/imported as a file. The form-based builder is
  just a UI over the same underlying source — editing a question in the form and switching to its
  code view shows the identical `.qwiz` text, always in sync.

## Authoring: form vs. code mode

Every quiz and every question can be edited two ways, and you can switch between them freely:

- **Form mode** — fill in fields (text, options, settings) through a normal UI. No syntax to
  learn; this is the default. Each option row carries its own correct marker, point weight and
  remove button, and an option's kind (text, image or video) is chosen by the button that adds it:

  ![The form builder](./screenshots/builder-form.png)

- **Code mode** — edit the question's (or the quiz metadata's) raw `.qwiz` source directly in a
  text area, with a live preview of the result beside it and the settings that apply to the
  current variant listed underneath. Faster once you know the format, and the only way to use a
  few things the form doesn't expose a control for (e.g. escaping option text that starts with
  `=`):

  ![Code mode, with a live preview](./screenshots/builder-code.png)

A question you aren't editing sits in **view mode** — a read-only preview shaped like the answer
itself, so a stack of them is scannable. Clicking any part of it opens the form focused there, and
a question whose source doesn't parse says so with an error count:

![A question card in view mode](./screenshots/builder-view.png)

Switching modes never loses data — code mode is parsed back into the same form fields, and vice
versa.

## Playing a quiz

Open any saved quiz's "Play" action to start a run. Every run opens on a welcome screen: the
quiz's title and description, and a list of the rules this particular quiz plays by — how many
questions there are, whether they can be skipped or gone back to, how long the clock gives you,
when answers and scores appear, and what it takes to win. All of it is derived from the quiz's
own settings, so it describes what the author actually configured rather than a generic blurb.

![The welcome screen at the start of a run](./screenshots/player-welcome.png)

Nothing starts until you press **Start quiz** — timers included, so a per-question or per-quiz
clock never runs down while you're still reading.

Depending on the quiz's settings (see
[quiz-wide settings](./qwiz-format.md#quiz-wide-settings)), answers and scores may be revealed
after every question or held until the end, and a run may only sample a subset of the question
bank in a random order.

![Playing a quiz](./screenshots/player.png)

Every question can be submitted unanswered — Submit stays available whether the question is empty,
half-finished or complete, and a skipped question is reported as "Skipped" rather than as a wrong
answer. Authors who want an answer forced can set
[`require_answer=true`](./settings.md#per-question-settings) on a question or across the whole quiz.

A run ends with a pass/fail result against the quiz's win threshold, scored against every question
in the run:

![Results at the end of a run](./screenshots/results.png)

Unless `reveal_answers=never`, a review screen then shows what you answered against what was
correct — every variant replayed through the same board you answered it on, locked:

![Reviewing answers after a run](./screenshots/review.png)

## Import & export

Every quiz can be downloaded as a `.qwiz` file (a plain-text file — safe to read, edit by hand,
back up, or share) via its card menu. The same file can be re-imported through **Import** on
the home page, either by uploading it or pasting its contents directly. Importing always creates a
new quiz — it never silently overwrites one you already have, even if the file was originally
exported from this same browser.

The **Import** dialog also offers a few built-in sample quizzes ("Load a sample") that each
exercise a different part of the format — a quick way to see real, valid `.qwiz` source before
writing your own.

![The import dialog](./screenshots/import.png)

## Sharing a quiz by link

A quiz can also be handed over as a single URL. **Share link** — in a quiz card's "⋮" menu on the
home page, or the same menu on its edit screen — compresses the whole `.qwiz` document and puts it
in the link itself, after the `#`:

![The share-link dialog](./screenshots/share-dialog.png)

Two things follow from the quiz living in the fragment (the part after `#`):

- **Nothing is uploaded.** A URL fragment is never sent to a server, so a shared quiz stays as
  private as a locally-stored one — there's no copy of it anywhere but in the link you sent.
- **The link is the whole quiz**, so its length grows with the quiz. Past ~8,000 characters the
  dialog warns that some chat apps and mail clients may cut it off; past 32,000 — which in
  practice means a quiz with embedded image data — it refuses to make a link at all and points you
  at Download `.qwiz` instead, since a URL that long stops working in browsers.

Opening a shared link goes straight to the welcome screen and plays the quiz **from the link**.
It isn't added to the recipient's library unless they choose **Save a copy**, which imports it as
a brand-new quiz exactly as the Import dialog would.

## Publishing on GitHub

A link carries one quiz, and it has a size limit. To publish a set of them — or a single quiz you
want to keep editing in place — put the `.qwiz` files in a **public GitHub repository or gist** and
open them by pointer instead:

| What you have                | The link                                     |
| ---------------------------- | -------------------------------------------- |
| A gist                       | `/play?gist=<gist id or link>`               |
| One file in a repository     | `/play?repo=owner/name&path=rounds/one.qwiz` |
| A whole repository or folder | `/group?repo=owner/name`                     |

You can also paste any of those into **Import → "or open one published on GitHub"**.

![A quiz group browsed as folders](./screenshots/group-folders.png)

A repository needs nothing special: point Qwiz at one and it lists every `.qwiz` file in it, using
the folders as the grouping. Adding a [`.qwizgroup` manifest](./qwizgroup-format.md) is what lets
you order them, name them, and choose how they're played — as an unlocking journey, one merged
mega-quiz, a playlist, and so on.

Two things to know, since this is the one time Qwiz talks to a server:

- **It reads, signed out, and saves nothing.** Only public repositories and gists are visible to it,
  your GitHub session is never attached, and opening a quiz doesn't add it to your library —
  **Save a copy** does, exactly as with a shared link. Your own quizzes still never leave your
  browser.
- **Publishing a manifest avoids a rate limit.** Finding files in a repository _without_ a
  `.qwizgroup` needs GitHub's API, which allows 60 requests an hour per IP address — shared with
  everyone else on your network. A manifest that lists its quizzes needs none of that budget at all.

## Next

If you want a single self-contained specification — for your own reference, or to hand to a model
that should generate `.qwiz` files — see [the complete `.qwiz` reference](./llm-reference.md). The
[`examples/`](../examples) folder holds ten playable files covering every variant and setting,
loadable from Import → Load a sample.

See [the `.qwiz` format reference](./qwiz-format.md) for the full authoring syntax: question
types, media, hints, scoring settings, and every quiz-wide/per-question option. To publish a set of
quizzes together, see [the `.qwizgroup` format](./qwizgroup-format.md).
