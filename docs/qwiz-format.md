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

Written as `:key=value` lines inside the frontmatter block. Full reference — every key, its type
and default, and how settings behave in combination — lives in
[`settings.md`](./settings.md#quiz-wide-settings), kept as the one place this is documented rather
than a second copy here that could drift. In brief: win threshold (`points_to_win`/
`percentage_points_to_win`), ordering/sampling (`shuffle_questions`, `max_questions`), reveal
timing (`reveal_answers`, `reveal_scores`, `show_score`, `show_intermediate_screen`), and time
limits (`timer_mode`, `timer_duration`, `timer_timeout_action`, `intermediate_screen_duration`).

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
- **`order`** — drag (or tap-to-pick-then-tap-to-place) items into the correct sequence — see
  [Order](#order) below.
- **`match`** — pair up items from a left column with items from a right column — see
  [Match](#match) below.
- **`categorise`** — sort items into buckets, several items per bucket — see
  [Categorise](#categorise) below.
- **`fill_in_blanks`** — fill in blanks in the question text from a word bank or by typing — see
  [Fill in the blanks](#fill-in-the-blanks) below.

Omitting a variant entirely defaults to the same behavior as `multiple_choice`.

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
- **`character_input` questions**: exactly one plain-text accepted answer (a second `=` line is a
  parse error — the guess mechanic is one fixed board of boxes/pre-reveals, so there's nothing a
  second answer could represent), marker ignored, image/video rejected — plus the `[X]` pre-reveal
  bracket syntax described below.

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

### Post-question analysis

```
!<analysis>[Why?](Water boils at 100°C at sea level because that's when its vapor pressure
equals atmospheric pressure.)
```

A question's post-answer explanation: shown on the intermediate/reveal screen once the question
is locked in, regardless of whether the player got it right or wrong — unlike a hint (above),
it's never player-triggered and never shown before answering, so it takes no `%N%` cost. Written
alongside the media lines above the option block; unlike hints, it can't be interspersed inside
`{ }`. At most one per question — a second `!<analysis>[...]` line is a parse error. `label` is
optional (defaults to "Why?" when shown); `content` is the explanation itself.

Only appears on the per-question intermediate screen (`show_intermediate_screen`, gated the same
way as live `reveal_answers`/`reveal_scores` — see [below](#quiz-wide-settings)) — it's never
shown on the end-of-quiz Review screen for quizzes that defer reveal to the end.

### Order

`order` presents a set of items and asks the player to arrange them into the correct sequence —
the order they're written in `{ }` IS the answer key, so it's never shown to the player unshuffled.

```
order: Arrange chronologically
{
=First
=Second
=Third
}
```

- Every line starts with `=` — the `=`/`~` marker doesn't matter (both are accepted purely for
  authoring convenience, same as `typed`), since every listed item is implicitly part of the
  sequence; there's no "wrong item," only a wrong position.
- At least 2 items are required — a single item has no meaningful order.
- An item's content can be an image or video, using the same syntax as question-level media —
  ordering pictures (e.g. "arrange these photos chronologically") is a real use case, unlike
  `typed`/`character_input` where content must always be plain text.
- Played by tapping an item to pick it up, then tapping a numbered position to place it (or
  tapping a filled position to swap) — works identically via mouse, touch, or keyboard
  (Tab + Enter/Space), with no drag gesture required.

### Match

`match` presents two columns and asks the player to pair up each left-side item with its matching
right-side entry — a 1-to-1 pairing, every target used exactly once.

```
match: Match the capital to its country
{
=Paris -> France
=Tokyo -> Japan
=Berlin -> Germany
}
```

- Every line is `item -> target`, split on the first `" -> "` — quote or backslash-escape the
  line (see [Escaping](#escaping)) if an item's own text genuinely needs to contain that.
- At least 2 pairs are required, and every target must be unique — two items can't both correctly
  pair with the same target (that's what [Categorise](#categorise) is for).
- Both `item` and `target` must be plain text (no image/video) for now.
- Played the same tap-to-pick-then-tap-to-place way as `order`: tap a left item, then tap a right
  target to pair them (or tap an already-paired target to steal it for the currently-picked item).

### Categorise

`categorise` presents a set of items and a set of buckets, and asks the player to sort each item
into its correct bucket — unlike `match`, several items can correctly share one bucket.

```
categorise: Sort these animals by habitat
{
=Fish -> Water
=Frog -> Water
=Lion -> Land
=Eagle -> Air
}
```

- Same `item -> target` syntax as `match`, but `target` is a bucket name here, not a unique
  pairing partner — the buckets shown to the player are simply the distinct set of targets across
  every option (there's no separate bucket-naming syntax). Repeating a target across several
  options is expected, not an error.
- At least 2 items are required. Both `item` and `target` must be plain text.
- Played by tapping an item to pick it up, then tapping a bucket to place it there (or tapping an
  already-placed item to pick it back up).

### Fill in the blanks

`fill_in_blanks` embeds one or more blanks directly in the question text and asks the player to
fill each one, either by picking words from a bank or by typing.

```
fill_in_blanks: The ___ is the powerhouse of the ___.
{
=mitochondria
=cell
~nucleus
}
:blank_input=bank
```

- Blanks are `___` (three underscores) tokens written directly in the question text — the number
  of `___` tokens must exactly match the number of correct (`=`) options, since each one is filled,
  left to right, by the correct options in the order they're written.
- `~` options don't fill any blank — they're extra distractor words added to the bank, same
  purpose as `letter_bank=auto`'s decoy letters in `character_input`: without them, every bank pick
  would be a guaranteed-right word with no risk to it.
- `blank_input` (per-question setting, see [below](#per-question-settings)) controls how a blank is
  filled: `bank` (default) — tap a bank word, then tap a blank to place it (same tap-to-place
  interaction as `order`/`match`/`categorise`), matched by exact text since the player picked it
  verbatim. `type` — a plain inline text field per blank, matched the same way a `typed` question's
  response is (`case_sensitive`/`numeric_tolerance`/`fuzzy_tolerance` all apply).
- Both blank-answer and distractor content must be plain text.

### Character input

`character_input` guesses a single accepted answer letter-by-letter via an on-screen bank —
Hangman, in other words.

```
character_input: Guess the capital of France
{
=[P]aris
}
:letter_bank=alphabet
:prereveal_mode=all
:penalty=-1
```

- **`[X]` pre-reveal brackets**: wrap a character in `[ ]` inside the accepted-answer line to
  reveal it from the start, free of charge — `=[P]aris` pre-reveals "P". Multiple markers are
  fine: `=[P]a[r]is`. Only meaningful on the first accepted answer (if more than one is given, the
  rest are just alternate matches, same as `typed`). Form mode offers the same thing as a row of
  clickable letter buttons under the answer field, instead of typing brackets directly.
- Only `\p{L}` Unicode letters are ever guessable — spaces, punctuation, and digits in the answer
  are always shown and never count toward scoring, same as a real Hangman board doesn't ask you to
  guess the spaces between words.
- The bank offers a set of letters controlled by `letter_bank` (see the settings table below); the
  player clicks/taps one to guess it.

### Per-question settings

Written as `:key=value` lines, before or after the option block. Full reference — every key, its
type/default/applicable variant(s), and how settings behave in combination (which combinations are
rejected, which are harmless no-ops, and which are valid but non-obvious) — lives in
[`settings.md`](./settings.md#per-question-settings). In brief: scoring (`point`, `penalty`,
`partial_points`), selection limits (`min_answers`, `max_answers`), choice-only display
(`option_display`, `shuffle`), typed matching (`case_sensitive`, `numeric_tolerance`,
`fuzzy_tolerance`, `input_display`), and character_input's own (`letter_bank`,
`letter_bank_chars`, `prereveal_mode`, `prereveal_count`). `option_display` accepts `list`,
`grid2x2` (a fixed 2-column grid), and `grid3x3` (2 columns on narrow screens, 3 on wider ones).

A setting outside its applicable variant is a parse error, not a silent no-op — e.g. `shuffle` on
a `typed` question, or `letter_bank` on a `multiple_choice` question. `min_answers`, `max_answers`,
and `partial_points` are also rejected on `single_choice` — it can only ever have zero or one
option selected, so none of the three mean anything for it.

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
  a word where it appears three times is one scoring event, regardless of `prereveal_mode`. A
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
:prereveal_mode=all
:penalty=-1
```
