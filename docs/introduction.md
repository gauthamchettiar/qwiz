# Introduction

Qwiz builds and plays quizzes entirely in your browser. There's no account, no server, and no
sync — every quiz you create is saved to your browser's `localStorage` and never leaves your
device. Clearing your browser's site data for this domain deletes your quizzes; there's no
recovery beyond a `.qwiz` file you've exported yourself (see [Import & export](#import--export)).

## Core concepts

- **A quiz** is a title, description, category, tags, a list of questions, and a set of scoring
  settings (win threshold, shuffling, reveal timing, etc.).
- **A question** is either `choice` (pick one or more options) or `typed` (type a free-text
  answer) — see [the format reference](./qwiz-format.md) for the full syntax of both.
- **Everything round-trips through one format**: the `.qwiz` plain-text format is both what you
  can hand-write in code mode and what gets exported/imported as a file. The form-based builder is
  just a UI over the same underlying source — editing a question in the form and switching to its
  code view shows the identical `.qwiz` text, always in sync.

## Authoring: form vs. code mode

Every quiz and every question can be edited two ways, and you can switch between them freely:

- **Form mode** — fill in fields (text, options, settings) through a normal UI. No syntax to
  learn; this is the default.
- **Code mode** — edit the question's (or the quiz metadata's) raw `.qwiz` source directly in a
  text area. Faster once you know the format, and the only way to use a few things the form
  doesn't expose a control for (e.g. escaping option text that starts with `=`).

Switching modes never loses data — code mode is parsed back into the same form fields, and vice
versa.

## Playing a quiz

Open any saved quiz's "Play" action to start a run. Depending on the quiz's settings (see
[quiz-wide settings](./qwiz-format.md#quiz-wide-settings)), answers and scores may be revealed
after every question or held until the end, and a run may only sample a subset of the question
bank in a random order. A run ends with a pass/fail result against the quiz's win threshold, and
(unless `reveal_answers=never`) a review screen showing what you answered.

## Import & export

Every quiz can be downloaded as a `.qwiz` file (a plain-text file — safe to read, edit by hand,
back up, or share) via its card menu. The same file can be re-imported through **Import Qwiz** on
the home page, either by uploading it or pasting its contents directly. Importing always creates a
new quiz — it never silently overwrites one you already have, even if the file was originally
exported from this same browser.

The **Import Qwiz** dialog also offers a few built-in sample quizzes ("Load a sample") that each
exercise a different part of the format — a quick way to see real, valid `.qwiz` source before
writing your own.

## Next

See [the `.qwiz` format reference](./qwiz-format.md) for the full authoring syntax: question
types, media, hints, scoring settings, and every quiz-wide/per-question option.
