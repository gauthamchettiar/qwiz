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

single_choice: What is the capital of France?
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
single_choice: What is H2O?
```

```
variant : single_choice
What is H2O?
```

Recognized variants:

- **`single_choice`** — pick exactly one option. Exactly one `=` is required; more than one is a
  parse error. Always renders as a radio group.
- **`multiple_choice`** — pick one or more options. Any number of `=` (one or more). Always
  renders as checkboxes.
- **`typed`** — type a free-text answer, matched against one or more accepted answers.
- **`character_input`** — guess a word letter-by-letter from an on-screen bank, Hangman-style —
  see [Character input](#character-input) below.

Omitting a variant entirely defaults to the same behavior as `multiple_choice`. `choice` is a
recognized legacy name for `multiple_choice`, kept working for quizzes authored before the
single/multiple split — new authoring should use the explicit names.

### Options block

```
{
=correct option
~wrong option
=Water %4%
}
```

- Every line starts with `=` (correct/accepted) or `~` (incorrect) — one option per line.
- `single_choice` allows at most one `=` line; `multiple_choice` allows any number (one or more).
- An optional trailing `%N%` sets that option's own point value, overriding the question's
  `point`/`penalty` settings for just that option — e.g. `=Water %4%`, `~Salt %-1%`.
- An option's content can be an image or video, using the same syntax as question-level media
  (below) — e.g. `=![a cat](https://example.com/cat.jpg)`.
- **`typed` questions**: every option is an accepted answer, matched against what the player
  types — the `=`/`~` marker doesn't matter (both are accepted purely for authoring convenience,
  and the parser forces every option `correct: true`). An accepted answer must be plain text — an
  image/video option is a parse error, since matching is always a text comparison.
- **`character_input` questions**: same as `typed` — one or more plain-text accepted answers,
  marker ignored, image/video rejected — plus the `[X]` pre-reveal bracket syntax described below.

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

### Character input

`character_input` guesses a single accepted answer letter-by-letter via an on-screen bank —
Hangman, in other words.

```
character_input: Guess the capital of France
{
=[P]aris
}
:letter_bank=alphabet
:reveal_mode=all
:penalty=-1
```

- **`[X]` pre-reveal brackets**: wrap a character in `[ ]` inside the accepted-answer line to
  reveal it from the start, free of charge — `=[P]aris` pre-reveals "P". Multiple markers are
  fine: `=[P]a[r]is`. Only meaningful on the first accepted answer (if more than one is given, the
  rest are just alternate matches, same as `typed`).
- Only `\p{L}` Unicode letters are ever guessable — spaces, punctuation, and digits in the answer
  are always shown and never count toward scoring, same as a real Hangman board doesn't ask you to
  guess the spaces between words.
- The bank offers a set of letters controlled by `letter_bank` (see the settings table below); the
  player clicks/taps one to guess it.

### Per-question settings

Written as `:key=value` lines, before or after the option block.

| Key                 | Type                            | Applies to             | Default    | Meaning                                                                                                                                                                                     |
| ------------------- | ------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `point`             | number                          | all                    | `1`        | Points for each correct option/answer/letter without its own `%N%`                                                                                                                          |
| `penalty`           | number                          | all                    | `0`        | Points deducted for each incorrect option/wrong guess without its own `%N%`                                                                                                                 |
| `partial_points`    | boolean                         | choice, typed          | `false`    | Award credit for some (not all) correct picks/guesses, instead of requiring an exact match                                                                                                  |
| `min_answers`       | number                          | choice, typed          | — (none)   | Minimum selections/guesses required before submitting                                                                                                                                       |
| `max_answers`       | number                          | choice, typed          | — (none)   | Maximum selections/guesses allowed. `>1` on a `typed` question enables multi-guess mode                                                                                                     |
| `option_display`    | `list` \| `grid`                | choice only            | `list`     | Option layout                                                                                                                                                                               |
| `shuffle`           | boolean                         | choice only            | `false`    | Randomize this question's option order each run                                                                                                                                             |
| `difficulty`        | `easy` \| `medium` \| `hard`    | all                    | —          | Informational only, doesn't affect grading                                                                                                                                                  |
| `case_sensitive`    | boolean                         | typed, character_input | `false`    | Require exact letter case                                                                                                                                                                   |
| `numeric_tolerance` | number                          | typed only             | — (off)    | Allowed absolute numeric difference (e.g. `0.5` lets "3.5" match "3"). Mutually exclusive with `fuzzy_tolerance`                                                                            |
| `fuzzy_tolerance`   | number                          | typed only             | — (off)    | Allowed typos as % of answer length (edit distance). Mutually exclusive with `numeric_tolerance`                                                                                            |
| `input_display`     | `text` \| `boxes`               | typed only             | `text`     | Plain text box vs. one box per character                                                                                                                                                    |
| `letter_bank`       | `alphabet` \| `auto` \| `fixed` | character_input only   | `alphabet` | Which letters appear in the bank. `alphabet`: full A–Z. `auto`: every distinct letter in the answer plus a handful of decoys not in it. `fixed`: exactly the letters in `letter_bank_chars` |
| `letter_bank_chars` | text                            | character_input only   | —          | The exact letters offered — only read when `letter_bank=fixed`                                                                                                                              |
| `reveal_mode`       | `all` \| `sequence` \| `random` | character_input only   | `all`      | How a correct guess reveals repeated letters: all occurrences at once, one in reading order per guess, or one random occurrence per guess                                                   |
| `prereveal_count`   | number                          | character_input only   | `0`        | Extra random characters (beyond any `[X]` brackets) revealed free at the start                                                                                                              |

A setting outside its applicable variant is a parse error, not a silent no-op — e.g. `shuffle` on
a `typed` question, or `letter_bank` on a `choice` question.

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
- **Character input**: scored per DISTINCT guessable letter, not per occurrence — guessing "e" in
  a word where it appears three times is one scoring event, regardless of `reveal_mode`. A
  correctly-guessed letter earns `point`; a wrong guess costs `penalty`. Pre-revealed letters
  (`[X]` brackets or `prereveal_count`) count toward neither earned nor achievable max — they were
  free, so they don't inflate either side.
- **Winning a run**: `points_to_win` (an absolute score) if set, else `percentage_points_to_win`
  (default `75`) against that run's own achievable max.

## Escaping

Two ways to force a line — or an option's content after its `=`/`~` marker — to be read as
literal text, bypassing every other special syntax (media, hints, point weights, settings):

- **Quote the whole thing**: `"50% off, no really"`
- **Escape just the leading character**: `\=5` for text that starts with a literal `=`

Both are equivalent; use whichever reads better for a given piece of content.

## Full examples

Also available in-app via Import Qwiz → "Load a sample".

**Choice/typed scoring** (multi-select partial credit, per-option weights, typed matching) — also
via "Load a sample" → **Advanced Scoring**:

```
---
title: Advanced Scoring
description: Multi-select partial credit and per-option point weights.
category: demo
tags: [demo, scoring]
:points_to_win=15
---

multiple_choice: Which of these are primary colors? (select all that apply)
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

**Character input** (pre-reveal, letter bank, penalty) — also via "Load a sample" →
**Hangman Challenge**:

```
---
title: Hangman Challenge
description: Guess each word one letter at a time. A wrong guess costs a point.
category: demo
tags: [demo, character_input]
---

character_input: Guess the capital of France (one letter pre-revealed)
{
=[P]aris
}
:letter_bank=alphabet
:reveal_mode=all
:penalty=-1
```
