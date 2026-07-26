# Settings reference

Every setting is a `:key=value` line — quiz-wide ones inside the frontmatter's `--- ... ---`
block, per-question ones after (or before) a question's `{ }` option block. Both use the same
syntax and the same validation path (`validateSettingValue` in `quizScript.ts`), and both are a
**closed set**: a key not listed here is a parse error, not a freeform pass-through.

This is the single dedicated reference for what each setting does. [`qwiz-format.md`](./qwiz-format.md)
covers the surrounding authoring syntax (variants, options, media, hints); this file covers
settings in depth, including how they behave _together_, not just individually.

## Quiz-wide settings

Written inside the frontmatter block.

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

## Per-question settings

Written after (or before) a question's `{ }` option block.

| Key                 | Type                            | Applies to             | Default    | Meaning                                                                                          |
| ------------------- | ------------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `point`             | number                          | all variants           | `1`        | Points for each correct option/answer/letter without its own `%N%`                               |
| `penalty`           | number                          | all variants           | `0`        | Points deducted for each incorrect option/wrong guess without its own `%N%`                      |
| `partial_points`    | boolean                         | choice, typed          | `false`    | Award credit for some (not all) correct picks/guesses instead of requiring an exact match        |
| `min_answers`       | number                          | choice, typed          | — (none)   | Minimum selections/guesses required before submitting                                            |
| `max_answers`       | number                          | choice, typed          | — (none)   | Maximum selections/guesses allowed. `>1` on a `typed` question enables multi-guess mode          |
| `option_display`    | `list` \| `grid`                | choice only            | `list`     | Option layout                                                                                    |
| `shuffle`           | boolean                         | choice only            | `false`    | Randomize this question's option order each run                                                  |
| `difficulty`        | `easy` \| `medium` \| `hard`    | all variants           | —          | Informational only, doesn't affect grading or play                                               |
| `case_sensitive`    | boolean                         | typed, character_input | `false`    | Require exact letter case                                                                        |
| `numeric_tolerance` | number                          | typed only             | — (off)    | Allowed absolute numeric difference. Mutually exclusive with `fuzzy_tolerance`                   |
| `fuzzy_tolerance`   | number                          | typed only             | — (off)    | Allowed typos as % of answer length (edit distance). Mutually exclusive with `numeric_tolerance` |
| `input_display`     | `text` \| `boxes`               | typed only             | `text`     | Plain text box vs. one box per character                                                         |
| `letter_bank`       | `alphabet` \| `auto` \| `fixed` | character_input only   | `alphabet` | Which letters appear in the bank                                                                 |
| `letter_bank_chars` | text                            | character_input only   | —          | Exact letters offered — only read when `letter_bank=fixed`                                       |
| `reveal_mode`       | `all` \| `sequence` \| `random` | character_input only   | `all`      | How a correct guess reveals repeated letters                                                     |
| `prereveal_count`   | number                          | character_input only   | `0`        | Extra random characters revealed free at the start                                               |

`choice` here means both `single_choice` and `multiple_choice` — nothing in this table
distinguishes between them (see `qwiz-format.md`'s [Variant](./qwiz-format.md#variant) section for
what _does_ differ between the two: how many `=` options are allowed, and radio vs. checkbox
rendering).

## How validation works

- **Unrecognized key** → parse error listing the valid keys (`validateSettingValue`).
- **Wrong variant** → parse error naming which variant(s) the key actually applies to (checked
  against each `SettingRule`'s `appliesTo` in `quizScript.ts` — one list per setting, not two
  separate "typed-only"/"choice-only" exclusion lists, since a setting can span more than one
  group, e.g. `case_sensitive` spans `typed` and `character_input` but not `choice`).
- **Wrong type/value** → parse error naming what was expected (a number, `true`/`false`, or one of
  an enum's fixed values).

Code mode and the settings form field share this exact same validation — neither can drift ahead
of the other into accepting something the other would reject.

## Setting interactions

Combinations that are validated, silently harmless, or genuinely worth knowing about — each of
these was actually exercised against the real parser/grading code, not assumed.

### Rejected combinations (parse errors)

- **`numeric_tolerance` + `fuzzy_tolerance`** on the same question — pick one matching strategy.
- **`min_answers` > `max_answers`** — an unsatisfiable range.
- **`max_answers` below the number of correct options/accepted answers, without `partial_points`**
  — makes an exact match impossible; the question could only ever score 0.
- **`reveal_answers=after_every_question` + `show_intermediate_screen=false`** (quiz-wide) —
  revealing which options were correct needs a real screen, not just a flash.
- **`single_choice` with more than one `=`** — use `multiple_choice` instead.
- **`letter_bank=fixed` with no (or no letter-containing) `letter_bank_chars`** — would produce a
  completely empty bank: an unplayable question with nothing to click, not just a degraded one.
  `letter_bank_chars=123` (digits only) is caught too, not just an empty string.
- **`points_to_win` + `percentage_points_to_win` both set** (quiz-wide) — `points_to_win` always
  wins (see `gradeRun`), so the percentage one would be silently dead. Same category of "two
  things that can't both take effect" as the `numeric_tolerance`/`fuzzy_tolerance` conflict above,
  just at the quiz level instead of per-question.

### Allowed but a no-op

- **`single_choice` + `partial_points=true`** — harmless, not rejected. A `single_choice` question
  only ever has zero or one correct option, so there's no "some but not all" scenario for partial
  credit to apply to; the setting simply never has anything to do.
- **`numeric_tolerance` + `case_sensitive`** — `case_sensitive` is ignored once numeric comparison
  kicks in, since numbers have no case. Only affects the fallback text comparison when either side
  isn't actually numeric.

### Valid, but non-obvious

- **`case_sensitive` + `fuzzy_tolerance`** changes what the fuzzy match actually compares, not
  just whether it's case-insensitive. `"PARIS"` vs. `"Paris"` is edit-distance 0 case-insensitively
  (identical once lowercased) but edit-distance 4 case-sensitively (every letter's case differs) —
  enough to fall outside a 20% tolerance that would otherwise have matched. An author combining
  both should expect case differences to eat into the same typo budget as real spelling mistakes.
- **`reveal_mode` never affects scoring**, only display. `character_input` scores per _distinct_
  guessed letter regardless of how many times it appears in the word — guessing "e" in a word
  where it appears three times is one scoring event whether `reveal_mode=all` reveals all three at
  once or `sequence`/`random` trickles them out one guess at a time.
- **Pre-revealed letters (`[X]` brackets or `prereveal_count`) are excluded from scoring** even if
  somehow re-clicked — `gradeCharacterInputQuestion` filters them out of the scorable letter set
  before checking what was guessed, so this holds regardless of UI state. The bank UI also
  disables a pre-revealed letter's button from the very first render (nothing productive for a
  click to do), rather than only after it's actually been guessed.
- **`prereveal_count`'s random pick is resolved once per play session**, not re-randomized on
  every re-render — `QuestionPlayer.svelte` resolves it at mount (`resolveExtraPrereveal`), the
  same way question/option shuffling is resolved once upfront by `buildPlayRun` rather than
  reshuffling on every read. A "Try again" (standalone testing mode) re-rolls it as a genuinely
  fresh session, same as a real Hangman round starting over.
- **`letter_bank=auto` always adds a few decoy letters** not in the answer, even though the
  "real" letters alone would be enough to display. Without decoys, every bank click would be a
  guaranteed hit — `penalty` would never actually trigger, defeating the point of a wrong-guess
  cost existing at all.
- **The upfront "total achievable score" header can slightly overstate a `character_input`
  question's real max for that specific play session**, when `prereveal_count > 0`. The header
  total (`questionMaxPoints`) is computed against a blank, question-only state with no session
  resolved yet, so it doesn't know which letters `prereveal_count` will end up giving away for
  free — those letters no longer count toward that session's actual achievable max once resolved.
  This is a deliberate simplification, not a bug: it keeps the upfront total stable and
  deterministic (the same number every time you look at it) rather than randomly varying per
  session before a single question has even been shown.
