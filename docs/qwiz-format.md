# `.qwiz` format reference

`.qwiz` is a small, Markdown-like plain-text format for authoring a quiz: one frontmatter block
followed by one or more questions, each separated by a blank line.

```
---
title: World Capitals
description: A quick trip around the globe.
category: geography
tags: [geography, capitals, easy]
:max_questions=5
:shuffle_questions=true
---

choice: What is the capital of France?
{
=Paris
~London
~Berlin
}

typed: What is the capital of Japan?
{
=Tokyo
}
:fuzzy_tolerance=15
```

This is real, importable source — paste it into **Import Qwiz** to try it. More full examples of
every feature below are built into the app itself (Import Qwiz → "Load a sample").

## Frontmatter

The block between the two `---` lines. All fields are optional.

| Field         | Value                                                 |
| ------------- | ----------------------------------------------------- |
| `title`       | Plain text                                            |
| `description` | Plain text (a literal newline is written as `\n`)     |
| `category`    | Plain text                                            |
| `tags`        | Inline array: `tags: [one, two, three]`               |
| `:key=value`  | Quiz-wide settings — see [below](#quiz-wide-settings) |

## Quiz-wide settings

Written as `:key=value` lines inside the frontmatter block.

| Key                        | Type                                          | Default                                     | Meaning                                                                                                               |
| -------------------------- | --------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `points_to_win`            | number                                        | — (uses `percentage_points_to_win` instead) | Absolute score a player must reach to win                                                                             |
| `percentage_points_to_win` | number                                        | `75`                                        | % of max achievable score needed to win, if `points_to_win` isn't set                                                 |
| `shuffle_questions`        | boolean                                       | `true`                                      | Randomize question order each run                                                                                     |
| `max_questions`            | number                                        | — (all shown)                               | Max questions sampled per run, when the bank is larger                                                                |
| `reveal_answers`           | `after_every_question` \| `at_end` \| `never` | `after_every_question`                      | When correct answers become visible                                                                                   |
| `reveal_scores`            | `after_every_question` \| `at_end` \| `never` | `after_every_question`                      | When points earned become visible (independent of `reveal_answers`)                                                   |
| `show_score`               | boolean                                       | `true`                                      | Persistent running score header during the run                                                                        |
| `show_intermediate_screen` | boolean                                       | `true`                                      | Pause on a per-question reveal screen before advancing. Cannot be `false` while `reveal_answers=after_every_question` |

## Questions

Each question is one blank-line-separated block. Only the question's **text** and its `{ }`
**option block** are required — everything else is optional.

### Variant

Two ways to declare a question's type, both equivalent:

```
choice: What is H2O?
```

```
variant : choice
What is H2O?
```

Recognized variants: `choice` (pick one or more of several options) and `typed` (type a free-text
answer). Omitting a variant entirely defaults to plain multiple-choice, same as `choice`.

### Options block

```
{
=correct option
~wrong option
=Water %4%
}
```

- Every line starts with `=` (correct/accepted) or `~` (incorrect) — one option per line.
- Any number of `=` lines is allowed regardless of variant: `choice` covers single-select (one
  `=`) and multi-select (several `=`) alike.
- An optional trailing `%N%` sets that option's own point value, overriding the question's
  `point`/`penalty` settings for just that option — e.g. `=Water %4%`, `~Salt %-1%`.
- An option's content can be an image or video, using the same syntax as question-level media
  (below) — e.g. `=![a cat](https://example.com/cat.jpg)`.
- **`typed` questions**: every option is an accepted answer, matched against what the player
  types — the `=`/`~` marker doesn't matter (both are accepted purely for authoring convenience,
  and the parser forces every option `correct: true`). An accepted answer must be plain text — an
  image/video option is a parse error, since matching is always a text comparison.

### Question-level media

```
![alt text](https://example.com/image.jpg)
!<image>[alt text](https://example.com/image.jpg)
!<youtube>[alt text](https://www.youtube.com/watch?v=...)
```

`![...]` and `!<image>[...]` are equivalent — plain image syntax is just a shorter alias. Video has
no bare-marker alias; it's always `!<youtube>[...]`.

### Hints

```
!<reveal>[Need a hint?](It's in Paris, France.) %-1%
```

A question-level hint: `label` is shown before it's revealed, `content` after, and the optional
trailing `%N%` is its reveal cost (omit for a free hint). Can be written alongside the media lines
above the option block, or interspersed among the `=`/`~` lines inside it — either way it's a
hint for the whole question, never tied to whichever option it's physically next to.

### Per-question settings

Written as `:key=value` lines, before or after the option block.

| Key                 | Type                         | Applies to  | Default  | Meaning                                                                                                          |
| ------------------- | ---------------------------- | ----------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `point`             | number                       | both        | `1`      | Points for each correct option/answer without its own `%N%`                                                      |
| `penalty`           | number                       | both        | `0`      | Points deducted for each incorrect option/wrong guess without its own `%N%`                                      |
| `partial_points`    | boolean                      | both        | `false`  | Award credit for some (not all) correct picks/guesses, instead of requiring an exact match                       |
| `min_answers`       | number                       | both        | — (none) | Minimum selections/guesses required before submitting                                                            |
| `max_answers`       | number                       | both        | — (none) | Maximum selections/guesses allowed. `>1` on a `typed` question enables multi-guess mode                          |
| `option_display`    | `list` \| `grid`             | choice only | `list`   | Option layout                                                                                                    |
| `shuffle`           | boolean                      | choice only | `false`  | Randomize this question's option order each run                                                                  |
| `difficulty`        | `easy` \| `medium` \| `hard` | both        | —        | Informational only, doesn't affect grading                                                                       |
| `case_sensitive`    | boolean                      | typed only  | `false`  | Require exact letter case                                                                                        |
| `numeric_tolerance` | number                       | typed only  | — (off)  | Allowed absolute numeric difference (e.g. `0.5` lets "3.5" match "3"). Mutually exclusive with `fuzzy_tolerance` |
| `fuzzy_tolerance`   | number                       | typed only  | — (off)  | Allowed typos as % of answer length (edit distance). Mutually exclusive with `numeric_tolerance`                 |
| `input_display`     | `text` \| `boxes`            | typed only  | `text`   | Plain text box vs. one box per character                                                                         |

A setting outside its applicable variant is a parse error, not a silent no-op — e.g. `shuffle` on
a `typed` question, or `case_sensitive` on a `choice` question.

## Scoring

- **Effective points** for an option: its own `%N%` weight if given, else the question's
  `point`/`penalty` default for correct/incorrect respectively, else `1` (correct) or `0`
  (incorrect).
- **Exact match (default, `partial_points=false`)**: all-or-nothing — every correct
  option/accepted answer must be picked/matched, with nothing extra, or the question scores `0`.
- **Partial credit (`partial_points=true`)**: each pick/guess is scored independently and summed.
  Achievable max is capped by `max_answers` when set — e.g. 3 correct options worth 1 point each
  with `max_answers=2` tops out at 2, not 3.
- **Hints**: a revealed hint's (usually negative) cost is added to the question's earned score;
  its cost only counts toward the achievable max if positive (a hint that can only cost points
  never inflates the max).
- **Typed matching**: always trimmed, accent-folded, and punctuation-stripped before comparing
  (unless `numeric_tolerance` applies, checked first against the untouched values so "3.14" isn't
  corrupted by punctuation-stripping). Case-insensitive unless `case_sensitive=true`.
- **Winning a run**: `points_to_win` (an absolute score) if set, else `percentage_points_to_win`
  (default `75`) against that run's own achievable max.

## Escaping

Two ways to force a line — or an option's content after its `=`/`~` marker — to be read as
literal text, bypassing every other special syntax (media, hints, point weights, settings):

- **Quote the whole thing**: `"50% off, no really"`
- **Escape just the leading character**: `\=5` for text that starts with a literal `=`

Both are equivalent; use whichever reads better for a given piece of content.

## Full example

Exercises scoring, images, video, and typed matching together — also available in-app via
Import Qwiz → "Load a sample" → **Advanced Scoring** / **Media & Hints Showcase**.

```
---
title: Advanced Scoring
description: Multi-select partial credit and per-option point weights.
category: demo
tags: [demo, scoring]
:points_to_win=15
---

choice: Which of these are primary colors? (select all that apply)
:partial_points=true
{
=Red %3%
=Green %3%
=Blue %3%
~Purple
}
:difficulty=easy

typed: What is the capital of France? (typo-tolerant)
:fuzzy_tolerance=20
{
=Paris
=paris
}
```
