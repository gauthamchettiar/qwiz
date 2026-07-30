# `.qwiz` format — complete reference

A single-file, self-contained specification of the `.qwiz` quiz format, written to be read in one
pass by a model generating quizzes. Everything the app currently supports is here; anything not
here is not supported.

**Ground rules**

- A `.qwiz` file is UTF-8 plain text. Structure comes from line prefixes, not indentation.
- Every construct is line-based: a line is a frontmatter field, a setting, a question header, a
  media line, an extra, a `{`/`}` block delimiter, or an option.
- Unknown setting keys, out-of-range values, and settings applied to a variant that doesn't accept
  them are **parse errors**, not silently ignored. Only emit what this document lists.
- Blank lines separate questions. Leading and trailing whitespace on a line is insignificant.
- **There is no comment syntax.** A `#` is ordinary text, so `:points_correct=2  # note` makes the
  value `2  # note` and fails validation.

---

## 1. File shape

```
---
title: My Quiz
description: One or two sentences shown in the quiz list.
category: geography
tags: [capitals, easy]
:reveal_answers=after_every_question
:points_correct=2
---

<question 1>

<question 2>
```

- The file **must** begin with `---` on line 1 and the frontmatter **must** be closed by a second
  `---`. Both are required.
- Frontmatter fields: `title`, `description`, `category` (all free text, single line) and `tags`
  (a `[a, b, c]` list). All are optional; a missing `title` means the quiz can't be saved in the
  app until one is supplied.
- Frontmatter may also contain `:key=value` **settings** — see §5 and §6.
- Everything after the closing `---` is the question body.

---

## 2. A question

```
<variant>: <question text>
![alt text](https://example.com/image.png)
!<reveal>[Label](Hint text) %-1%
{
=A correct option
~An incorrect option
}
:points_correct=2
:difficulty=medium
```

In order, a question consists of:

1. **A header line** — either `variant: text`, or a bare text line (which defaults to the
   `multiple_choice` variant). The variant name must be one of the eight in §3.
2. **Optional media lines** (§4) and **optional extras** (§4.3), in any order, after the header.
3. **An option block** delimited by `{` and `}` on their own lines. Required for every variant.
   Minimum contents, enforced at parse time:
   - `single_choice` — exactly one `=`; `character_input` — exactly one `=`.
   - `order`, `match`, `categorise` — **at least two** options.
   - `fill_in_blanks` — at least one `___` in the text, and one `=` per blank.
   - `multiple_choice`, `typed` — at least one option.
4. **Optional `:key=value` settings**, one per line, after the closing `}`.

Multi-line question text: continue on the next line before any media/extra/`{` line — consecutive
plain text lines are joined with a newline.

### Option markers

| Marker | Meaning                          |
| ------ | -------------------------------- |
| `=`    | Correct option / accepted answer |
| `~`    | Incorrect option (a distractor)  |

`=Item -> Target` gives an option a **target** (`match`, `categorise` — see §3).
`=Option %N%` gives an option its own **point weight**, overriding `points_correct` /
`points_wrong` for that option only. `N` may be negative or zero: `~Nearly right %1%` awards a
point for a wrong-but-close answer, `~Way off %-2%` penalises.

### Escaping

A line whose text would otherwise be read as syntax can be quoted or backslash-escaped:

```
{
="=not a marker"
=\~also literal
=A ratio of 3 -\> 4
}
```

---

## 3. The eight variants

### `single_choice` — pick exactly one

```qwiz-question
single_choice: What is the capital of France?
{
=Paris
~Lyon
~Marseille
}
```

Exactly one `=` option. Renders as a radio group.

### `multiple_choice` — pick any number (the default variant)

```qwiz-question
multiple_choice: Which of these are prime?
{
=2
=3
~4
}
:partial_credit=true
```

Any number of `=` options. Renders as checkboxes. A bare header line with no `variant:` prefix is
this variant.

### `typed` — type the answer

```qwiz-question
typed: What is the capital of Italy?
{
=Rome
=Roma
}
:typo_tolerance=20
```

Every option is an accepted answer (both `=` and `~` are accepted as markers and treated as
correct). Options **must be plain text** — an image or video accepted answer is a parse error.
Matching always normalises whitespace, punctuation and accents; `match_case`, `number_tolerance`
and `typo_tolerance` control the rest. With `max_answers` above 1 the player banks several guesses
("name three of…").

### `character_input` — guess it letter by letter

```qwiz-question
character_input: The capital of France
{
=[P]aris
}
:letter_bank=alphabet
:letter_reveal=all
```

Exactly one `=` option, plain text. Square brackets around a character pre-reveal it. The player
clicks letters from an on-screen bank; scoring is per distinct guessable letter, and pre-revealed
letters count towards neither the score nor the maximum. Non-letters (spaces, punctuation) are
always shown and never guessable.

### `order` — put them in sequence

```qwiz-question
order: Arrange these chronologically, earliest first.
{
=Stonehenge
=Pompeii
=The Great Fire of London
}
```

Every option is correct — the **authored order is the answer key**. A `~` marker is accepted but
means nothing here: the parser forces every option correct regardless. Use `=` for clarity.
Options are always shown shuffled. Answered by dragging or tapping items into numbered slots, or
by typing with `answer_mode=type`.

### `match` — pair each item with its target

```qwiz-question
match: Match each capital to its country.
{
=Paris -> France
=Tokyo -> Japan
}
```

Every option is `item -> target`, and every option is correct. Each item pairs with exactly one
target and vice versa. Both columns are shown shuffled.

### `categorise` — sort items into buckets

```qwiz-question
categorise: Sort these animals.
{
=Dolphin -> Mammal
=Bat -> Mammal
=Ostrich -> Bird
}
```

Same `item -> target` shape as `match`, but a target is a **bucket** that holds any number of
items. Buckets are derived from the distinct targets in first-appearance order — there is no
separate bucket-declaration syntax.

### `fill_in_blanks` — complete the sentence

```qwiz-question
fill_in_blanks: The ___ is the powerhouse of the ___.
{
=mitochondria
=cell
~nucleus
}
```

`___` (three underscores) in the question text marks each blank. The `=` options fill the blanks
**left to right**, so their count must equal the number of `___` tokens — a mismatch is a parse
error. `~` options are decoy words for the bank, with no blank of their own.

---

## 4. Media and extras

### 4.1 Question media

```
![Alt text](https://example.com/photo.jpg)
!<image>[Alt text](https://example.com/photo.jpg)
!<youtube>[Alt text](https://www.youtube.com/watch?v=VIDEO_ID)
```

`![...]` and `!<image>[...]` are equivalent. `!<youtube>` embeds a YouTube video — only YouTube
URLs render. Any number of media lines per question. Image URLs may be `https:` or a `data:` URI.
A URL must not contain `)`.

### 4.2 Media as an option

Prefix with the option marker: `=![A photo of Paris](https://…)`. Not allowed on `typed` or
`character_input`, whose answers must be text.

### 4.3 Extras: hints and analysis

```
!<reveal>[Need a clue?](It rhymes with "door".) %-1%
!<analysis>[Why?](Explains the answer, shown after the reveal.)
```

- `!<reveal>` — a hint, hidden until the player chooses to reveal it. The tag is `reveal`, **not**
  `hint`. Its cost is a `%N%` weight _after the closing parenthesis_, not inside the label;
  omit it for a free hint. Any number per question, and they may also be interspersed among the
  `=`/`~` lines inside `{ }` (still question-level wherever they sit).
- `!<analysis>` — not revealable during answering; shown on the reveal screen once the answer is
  in. Use it to explain _why_. No weight, at most one per question (a second is a parse error), and
  it must sit above the option block, never inside `{ }`.

The label is the clickable text; the parenthesised part is the content.

> **An unrecognised `!<…>` line is not an error.** It is silently kept as more question text, so a
> typo'd tag produces a question that parses cleanly and displays the raw line to the player. There
> are exactly four tags: `<image>`, `<youtube>`, `<reveal>`, `<analysis>`.

---

## 5. Per-question settings

Written as `:key=value` lines after the option block. Booleans accept `true`/`false`/`yes`/`no`.

| Setting                  | Values                     | Default    | Applies to                                                       | Quiz-wide |
| ------------------------ | -------------------------- | ---------- | ---------------------------------------------------------------- | --------- |
| `points_correct`         | `number`                   | `1`        | all                                                              | yes       |
| `points_wrong`           | `number`                   | `0`        | all                                                              | yes       |
| `partial_credit`         | `true / false`             | `false`    | multiple_choice, typed, order, match, categorise, fill_in_blanks | yes       |
| `options_layout`         | `list / grid2x2 / grid3x3` | `list`     | single_choice, multiple_choice                                   | yes       |
| `min_answers`            | `number`                   | —          | multiple_choice, typed                                           | no        |
| `max_answers`            | `number`                   | —          | multiple_choice, typed                                           | no        |
| `shuffle_options`        | `true / false`             | `false`    | single_choice, multiple_choice                                   | yes       |
| `difficulty`             | `easy / medium / hard`     | —          | all                                                              | no        |
| `match_case`             | `true / false`             | `false`    | typed, order, match, categorise, fill_in_blanks                  | yes       |
| `number_tolerance`       | `number`                   | —          | typed, order, match, categorise, fill_in_blanks                  | yes       |
| `typo_tolerance`         | `number`                   | —          | typed, order, match, categorise, fill_in_blanks                  | yes       |
| `typed_input`            | `field / boxes`            | `text`     | typed                                                            | yes       |
| `letter_bank`            | `alphabet / auto / fixed`  | `alphabet` | character_input                                                  | yes       |
| `letter_bank_chars`      | `string`                   | —          | character_input                                                  | yes       |
| `letter_reveal`          | `all / sequence / random`  | `all`      | character_input                                                  | yes       |
| `letters_shown_at_start` | `number`                   | `0`        | character_input                                                  | yes       |
| `answer_mode`            | `pick / type`              | `pick`     | order, match, categorise, fill_in_blanks                         | yes       |

The **Quiz-wide** column says whether the setting can also be written once in the frontmatter as a
default for every question — see §7. `min_answers`, `max_answers` and `difficulty` cannot.

What each one does:

- `points_correct` — Points awarded for each correct option/pair/placement that doesn't specify its own %N% weight.
- `points_wrong` — Points deducted for each incorrect option/pair/placement that doesn't specify its own %N% weight.
- `partial_credit` — Whether getting some (not all) of a question right earns partial credit instead of requiring an exact match — e.g. for a typed question with 3 accepted answers, matching only 1 of them awards that one's points instead of 0. For order/match/categorise/fill_in_blanks, "some but not all" means some but not all items/pairs/buckets/blanks placed correctly.
- `options_layout` — How a choice question's options are laid out. "list": one per row. "grid2x2": a fixed 2-column grid. "grid3x3": 2 columns on narrow screens, 3 on wider ones.
- `min_answers` — Minimum number of options/answers the player must select or give before they can submit this question. Not meaningful for single_choice, which can only ever have zero or one selected.
- `max_answers` — Maximum number of options/answers the player is allowed to select or give for this question. Not meaningful for single_choice, which can only ever have zero or one selected.
- `shuffle_options` — For a choice question, whether its options are shown in a random order each time it's played. Not meaningful for a typed question.
- `difficulty` — How difficult this question is, for organizing or filtering later — purely informational, doesn't affect grading or play.
- `match_case` — For a typed question (or a fill_in_blanks question with answer_mode=type), whether a player's answer must match an accepted answer's exact letter case instead of being compared case-insensitively. Other normalization (whitespace, punctuation, accents) always applies regardless of this setting. Not meaningful for character_input: the player guesses by clicking a bank letter, not typing text, so there's no "wrong case" input to compare against — matching there is always case-insensitive. A no-op on fill_in_blanks when answer_mode=pick, since picking a bank word is never a case mismatch.
- `number_tolerance` — For a typed question (or a fill_in_blanks question with answer_mode=type), the allowed absolute difference between a numeric answer and a numeric response (e.g. 0.5 lets "3.5" match "3"). Falls back to normalized text comparison when either side isn't a number. Cannot be combined with typo_tolerance on the same question. A no-op on fill_in_blanks when answer_mode=pick.
- `typo_tolerance` — For a typed question (or a fill_in_blanks question with answer_mode=type), how many typos a response may have and still match, as a percentage of the accepted answer's length (edit distance). Cannot be combined with number_tolerance on the same question. A no-op on fill_in_blanks when answer_mode=pick.
- `typed_input` — How a typed question's answer field is displayed: a plain text box, or one box per character (grouped by word) sized to the first accepted answer's shape. Works in both single-answer and multi-guess (max_answers > 1) mode.
- `letter_bank` — Which letters appear in the on-screen letter bank. "alphabet": the full A-Z. "auto": every distinct letter actually in the answer, plus a handful of random decoy letters that aren't (so a guess still carries real risk). "fixed": exactly the letters in letter_bank_chars.
- `letter_bank_chars` — The exact letters offered in the bank — only read when letter_bank=fixed. E.g. "abcdefghijklmnop".
- `letter_reveal` — How a correct letter guess reveals its occurrences in the answer. "all": every occurrence at once (classic Hangman), and that letter's bank button disables immediately. "sequence"/"random": one not-yet-revealed occurrence per guess (next-in-order, or a random remaining one) — the bank button stays clickable until every occurrence of that letter is revealed.
- `letters_shown_at_start` — Additional random characters (on top of any explicit [x] pre-reveal brackets in the answer) revealed from the start, free of charge.
- `answer_mode` — How the answer is given, for the four variants that place things rather than select them. "pick": the on-screen board — tap an item then tap its target, or drag it there. "type": no board, just a text field per answer, matched the same way a typed question's response is (match_case/number_tolerance/typo_tolerance all apply). What gets typed depends on the variant: for fill_in_blanks each blank's word, for order the item belonging at each position, and for match/categorise each item's target or bucket.

---

## 6. Quiz-wide settings

Written as `:key=value` lines inside the frontmatter. These have no per-question equivalent.

| Setting                 | Values                                  | Default                |
| ----------------------- | --------------------------------------- | ---------------------- |
| `points_to_win`         | `number`                                | —                      |
| `percent_to_win`        | `number`                                | `75`                   |
| `shuffle_questions`     | `true / false`                          | `true`                 |
| `questions_per_run`     | `number`                                | —                      |
| `reveal_answers`        | `after_every_question / at_end / never` | `after_every_question` |
| `reveal_scores`         | `after_every_question / at_end / never` | `after_every_question` |
| `show_running_score`    | `true / false`                          | `true`                 |
| `show_reveal_screen`    | `true / false`                          | `true`                 |
| `timer_mode`            | `off / per_question / per_quiz`         | `off`                  |
| `timer_seconds`         | `number`                                | —                      |
| `on_timeout`            | `auto_submit / lock_zero`               | `auto_submit`          |
| `reveal_screen_seconds` | `number`                                | —                      |

What each one does:

- `points_to_win` — Total points a player must reach to "win" this quiz.
- `percent_to_win` — Percentage of the quiz's maximum possible score a player must reach to "win".
- `shuffle_questions` — Whether this quiz's questions are shown in a random order each run.
- `questions_per_run` — Maximum number of questions shown per run, picked from the question bank when it holds more than this.
- `reveal_answers` — When correct answers are revealed to the player during a run. "after_every_question" reveals them the moment each question is submitted, and locks that question — no going back. "at_end" holds every answer back until the whole quiz is submitted, and lets the player move freely between questions (with a confirmation before the final submit) until then. "never" reveals nothing, even in the end-of-quiz review.
- `reveal_scores` — When points earned are revealed to the player, independently of reveal_answers (e.g. show a running score without spoiling which options were correct). "after_every_question" shows each question's points the moment it's submitted — like reveal_answers, this alone is enough to lock that question with no going back. "at_end" only shows the total (and any per-question breakdown) once the quiz is submitted. "never" never shows any point value.
- `show_running_score` — Whether a persistent "earned / total" score is shown at the top of the screen throughout the run, updating as questions are answered. The total is always the quiz's full achievable points (knowable upfront, regardless of progress); the earned side follows reveal_scores — shown live when reveal_scores=after_every_question, otherwise masked as "? / total" until the quiz is submitted, so this never reveals anything reveal_scores is holding back.
- `show_reveal_screen` — Whether answering a question pauses on its own reveal screen (with a "Next question" button) before moving on, when something is revealed live (reveal_answers or reveal_scores set to after_every_question). Set to false to skip that pause and jump straight to the next question instead — the earned points for that question flash briefly next to the top score (show_running_score) rather than getting a full screen.
- `timer_mode` — Whether answering is under a time limit, and how it's scoped. "off": no timer. "per_question": timer_seconds seconds per question, resetting for each one. "per_quiz": one timer_seconds-second budget shared across the whole run. Requires timer_seconds to be set. "per_question" additionally requires reveal_answers or reveal_scores set to after_every_question — a per-question time limit only makes sense alongside "answering this locks it in immediately", which is exactly what that combination already means.
- `timer_seconds` — Seconds on the clock — per question (timer_mode=per_question) or for the whole run (timer_mode=per_quiz). Only read when timer_mode isn't "off".
- `on_timeout` — What happens to a question still being answered when its clock reaches zero (a per_question timer running out, or a per_quiz budget running out while a question is live). "auto_submit": whatever's currently selected/typed is submitted and graded as-is, same as clicking Submit. "lock_zero": the question locks with no credit, regardless of any partial selection/input.
- `reveal_screen_seconds` — Seconds the post-answer reveal screen waits before automatically advancing to the next question (or to results, on the last one) — a live countdown is shown next to the "Next question"/"See results" button. Unset: no auto-advance, the player clicks through manually. Requires show_reveal_screen to not be false — there's no screen to auto-advance from otherwise.

---

## 7. Setting inheritance

Any per-question setting marked **Quiz-wide: yes** in §5 may also be written in the frontmatter,
where it becomes the default for every question. A question that sets the same key overrides it.

```qwiz
---
title: Typed Throughout
:answer_mode=type
:typo_tolerance=25
:points_correct=2
---

match: Match the capitals.
{
=Paris -> France
=Tokyo -> Japan
}

categorise: Sort the animals.
{
=Fish -> Water
=Lion -> Land
}
:answer_mode=pick
```

Above, every placement question is typed except the last, which opts back out.

An inherited setting only reaches questions whose variant accepts it: a quiz-wide
`:letter_bank=auto` applies to `character_input` questions and is ignored by the rest, rather than
being an error.

---

## 8. Scoring

- Each option is worth its own `%N%` weight if it has one, else `points_correct` for a correct
  option or `points_wrong` for an incorrect one.
- Without `partial_credit`, a question is **all or nothing**: the exact correct set, the complete
  correct order, every pair, every blank — or zero.
- With `partial_credit=true`, each correct pick/slot/pair/blank scores independently.
- Revealed hints add their (usually negative) weight. A hint that can only cost points never
  raises the achievable maximum.
- The quiz is won at `points_to_win` if set, otherwise at `percent_to_win` of the achievable total
  (default 75).

---

## 9. Common mistakes

| Mistake                                                                     | Consequence                                                      |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Missing the opening or closing `---`                                        | The file is rejected                                             |
| A setting on a variant that doesn't accept it                               | Parse error — check the "Applies to" column                      |
| `fill_in_blanks` where `___` count ≠ number of `=` options                  | Parse error                                                      |
| `~` distractors on `order`, `match` or `categorise`                         | Silently treated as correct — every option is part of the answer |
| A misspelled `!<…>` tag (e.g. `!<hint>`)                                    | No error: the line becomes literal question text                 |
| An image or video option on `typed`/`character_input`                       | Parse error                                                      |
| `max_answers` below the number of correct options, without `partial_credit` | Rejected: unwinnable                                             |
| Both `number_tolerance` and `typo_tolerance` on one question                | Rejected: they conflict                                          |
| A `)` inside a media URL                                                    | Truncates the URL                                                |
| More than one `=` on `single_choice` or `character_input`                   | Parse error                                                      |
| Only one option on `order`, `match` or `categorise`                         | Parse error — they need at least two                             |
| A `#` "comment" after a setting value                                       | Becomes part of the value, then fails validation                 |

---

## 10. A complete example

```qwiz
---
title: Mixed Bag
description: One question of each kind, with scoring that bites.
category: general knowledge
tags: [demo, mixed]
:points_to_win=10
:reveal_answers=after_every_question
:reveal_scores=after_every_question
:points_wrong=-1
:partial_credit=true
---

single_choice: Which planet is closest to the Sun?
!<reveal>[Nudge me](It is not the hottest one.) %-1%
{
=Mercury
~Venus
~Mars
}
:points_correct=2

multiple_choice: Which of these are noble gases?
!<analysis>[Why?](Nitrogen is inert in practice but is not in group 18.)
{
=Helium
=Argon
~Nitrogen
}
:points_correct=2
:options_layout=grid2x2

typed: Roughly how tall is Mount Everest, in metres?
{
=8849
}
:number_tolerance=50
:points_correct=2

character_input: A collective noun for crows.
{
=[M]urder
}
:letter_reveal=all
:points_correct=2

order: Smallest to largest.
{
=Atom
=Grain of sand
=Football
}
:points_correct=2

match: Match the instrument to what it measures.
{
=Anemometer -> Wind speed
=Hygrometer -> Humidity
}
:answer_mode=type
:typo_tolerance=30
:points_correct=2

categorise: Element or alloy?
{
=Copper -> Element
=Bronze -> Alloy
=Iron -> Element
}
:points_correct=1

fill_in_blanks: A ___ angle is exactly 90 degrees.
{
=right
~acute
}
:points_correct=2
```

---

## 11. Checklist before emitting a file

1. Starts with `---`, frontmatter closed with `---`, `title` present.
2. Every question has a `{ … }` block with at least one option.
3. Every variant name is one of the eight in §3.
4. Every setting key appears in §5 or §6, and every value is in range.
5. Every setting is allowed on the variant it's attached to.
6. `order`/`match`/`categorise` use only `=` options; `match`/`categorise` give every option a
   `->` target.
7. `fill_in_blanks` has one `=` option per `___`.
8. No `)` inside any URL.
