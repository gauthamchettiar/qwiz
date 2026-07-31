/**
 * Parser for the (yet-unnamed) GIFT + Markdown inspired quiz authoring format:
 *
 *   ---
 *   title: "..."
 *   description: "..."
 *   category: "..."
 *   tags: [...]
 *   :questions_per_run=5
 *   ---
 *
 *   pick_many : What is H2O?
 *   ![alt](image link)
 *   !<image>[alt](image link)
 *   !<youtube>[alt](youtube link)
 *   !<reveal>[label](hint text) %-1%
 *   :difficulty=easy
 *   {
 *     =correct option
 *     ~wrong option
 *   }
 *   :shuffle_options=true
 *
 * A question's variant can also be declared with its text in one line —
 * `pick_many: What is H2O?` — instead of the two-line `variant : pick_many` + separate
 * text form; both set the same field. `pick_one` is `pick_many`'s sibling — identical
 * syntax, but the parser rejects more than one option marked `=` (a `pick_one` question with
 * zero or exactly one correct option is fine; two or more is a parse error). `type_answer` is the other
 * recognized variant: same `{ }` block, but every line in it is an
 * accepted answer instead of a right/wrong choice — the player types a response instead of picking
 * one. `=`/`~` still mark each line, but a type_answer question's parser forces every option
 * `correct: true` regardless, so both markers are accepted purely as authoring convenience; `%N%`
 * weights still work per accepted answer exactly as for choice. Matching is controlled by settings
 * (`match_case`, `number_tolerance`, `typo_tolerance`, `typed_input` — see `SETTING_RULES`)
 * rather than exact string equality, e.g.:
 *
 *   typed: What is the capital of France?
 *   {
 *     =Paris
 *     =paris
 *   }
 *   :typo_tolerance=15
 *
 * A typed option's content must be plain text — an image/video accepted answer is a parse error,
 * since matching is always a text comparison.
 *
 * Only a question's text and its `{ }` option block are required — the frontmatter, `variant`,
 * media lines, `!<reveal>` hints, and `:key=value` settings are all optional and default sensibly
 * (note: no space between the leading `:` and the key). Settings may appear before or after the
 * option block; each question in the body is separated from the next by a blank line (blank
 * lines inside `{ }` don't count).
 *
 * An image line is written `![alt](url)` or, equivalently, `!<image>[alt](url)`; a video line is
 * always `!<youtube>[alt](url)` — there's no bare `~[...]` video form.
 *
 * A `!<reveal>[label](hint text)` line adds a question-level hint (see `QuizScriptReveal`),
 * optionally suffixed `%N%` for its reveal cost the same way an option's points are — `%-1%` for
 * a one-point penalty, omitted for a free hint. It can be written anywhere a question can have
 * content: alongside the media lines above the option block, or interspersed among the `=`/`~`
 * lines inside it (still a question-level hint either way, not attached to whichever option it's
 * physically next to — see `parseQuestionBlock`'s handling of it inside `{ }`).
 *
 * A `!<analysis>[label](explanation)` line adds a question's post-answer explanation (see
 * `QuizScriptAnalysis`) — shown on the intermediate/reveal screen once the question is locked in,
 * regardless of right or wrong, unlike `!<reveal>` which is player-triggered and pre-answer. No
 * `%N%` weight (nothing to cost), and at most one per question (a second line is a parse error).
 * Written alongside the media lines, above the option block — never interspersed inside `{ }`.
 *
 * Inside the option block, every line is exactly one option, starting with `=` (correct) or `~`
 * (incorrect), optionally ending with an explicit point value — `=Water %4%` — instead of relying
 * on question-level `:points_correct=`/`:points_wrong=` settings. `pick_many` allows any number of `=`
 * lines (one or more); `pick_one` allows at most one. An option's own content can be an image
 * or video the same way question-level media is written
 * — `=![a cat](url)` or `=!<youtube>[intro](url)` — checked against whatever remains after
 * stripping the `=`/`~` marker (and any `%N%` weight); anything not matching that shape is plain
 * text. (A `!<reveal>` line inside `{ }` has no `=`/`~` marker of its own — see above.)
 *
 * `:key=value` settings (both here, per-question, and inside the frontmatter block, quiz-wide —
 * see `SETTING_RULES` / `QUIZ_SETTING_RULES`) are restricted to a closed set of known keys; an
 * unrecognized key is a parse error, not a freeform pass-through. `number_tolerance` and
 * `typo_tolerance` are additionally mutually exclusive on the same question — a rare example of
 * a cross-setting check, rather than each key being validated purely on its own.
 *
 * `parseQuizScriptQuestion` / `serializeQuizScriptQuestion` and `parseQuizScriptFrontmatter` /
 * `serializeQuizScriptFrontmatter` parse and re-emit a single question's or the frontmatter's own
 * source in isolation — the units a per-question / quiz-metadata code editor each operate on.
 * `parseQwizFile` parses a whole `.qwiz` document (frontmatter + every question) for import.
 */

export interface QuizScriptFrontmatter {
  title: string;
  description: string;
  category: string;
  tags: string[];
  /** Quiz-wide `:key=value` settings (see `QUIZ_SETTING_RULES`) — the same syntax and closed-set
   * validation a question's own settings use, just scoped to the whole quiz instead of one
   * question, and written inside the `--- ... ---` frontmatter block rather than after it. */
  settings: QuizScriptSettings;
}

export type QuizScriptMedia =
  { kind: 'image'; alt: string; url: string } | { kind: 'video'; alt: string; url: string };

/** An option's content is either plain text or the same image/video shape question-level media
 * uses — one option can BE a picture or a clip, not just describe one. */
export type QuizScriptOptionContent = { kind: 'text'; text: string } | QuizScriptMedia;

export interface QuizScriptOption {
  content: QuizScriptOptionContent;
  correct: boolean;
  /** Explicit per-option point value from a trailing `%N%` annotation, e.g. `~Salt %-1%`.
   * `undefined` when not given — this is NOT auto-filled from a question's `:points_correct`/`:points_wrong`
   * settings; reconciling those two mechanisms is a scoring concern left to a later consumer. */
  points?: number;
  /** `guess_letters` only: character indices into `content.text` (only ever `kind: 'text'` for
   * this variant) that are pre-revealed from the start — authored with a `[X]` bracket around
   * that character, e.g. `=[P]aris` pre-reveals index 0. `undefined`/empty when none are marked.
   * Never set for any other variant. */
  prerevealed?: number[];
  /** `match_pairs`/`group_items` only: the right-hand entry this item pairs with (`match_pairs`) or the
   * bucket it belongs to (`group_items`) — authored as `=item -> target`. For `match_pairs`, every
   * option's own `target` is unique and doubles as that item's one right-column entry; for
   * `group_items`, several options can share the same target, and the distinct set of targets across
   * all options IS the list of buckets (there's no separate bucket-naming syntax).
   *
   * Same content shape as `content`, so a `match_pairs` right column can be pictures too — matching
   * a flag to a map is as natural as matching two words. `group_items` is the exception and its
   * targets stay `kind: 'text'` (enforced at parse time): a bucket's label is its IDENTITY, the
   * thing several items are compared against and deduplicated by, which only works for a value that
   * reads as one name. Never set for any other variant. */
  target?: QuizScriptOptionContent;
}

/** An option's words: its own text, or an image/video's alt text — the only words a non-text option
 * has. For everywhere an option has to appear as a LABEL rather than as rendered content: the field
 * that asks about it, the answer-key line that names it, the builder's own preview rows. An option
 * with neither (a bare image URL, no alt) yields `''`, which every caller already has to handle for
 * an option the author simply left empty. */
export function optionLabelText(option: QuizScriptOption): string {
  return option.content.kind === 'text' ? option.content.text : option.content.alt;
}

/** The same thing for an option's `target` — the words its right-column entry or bucket has. Used
 * for `group_items` bucket labels (always text by construction), for the accessible name of a
 * `match_pairs` right-column button that renders a picture, and for what an `answer_mode=type`
 * slot expects to be typed. `''` for an option with no target at all. */
export function optionTargetText(option: QuizScriptOption): string {
  if (!option.target) return '';
  return option.target.kind === 'text' ? option.target.text : option.target.alt;
}

/** A content value's canonical identity — its serialized form, so two options are "the same
 * target" exactly when they'd round-trip to the same source line. Text compares by its own text
 * (unchanged from when targets were plain strings); a picture compares by url AND alt, so two
 * genuinely distinct images never collapse into one bucket just because neither has alt text.
 * Used for `match_pairs`'s unique-target rule and `categoriseBuckets`'s dedupe. */
export function optionContentKey(content: QuizScriptOptionContent): string {
  return content.kind === 'text' ? content.text : formatOptionContent(content);
}

/** A question-level hint: `label` is the prompt shown before it's revealed (e.g. "Need a hint?"),
 * `content` is the hint text itself, and `points` is the (usually negative) cost of revealing it —
 * mirrors quizare's reveal-kind PromptExtra, minus the runtime revealed/not-revealed player state,
 * since qwiz has no play mode yet, only authoring. Written `!<reveal>[label](content)`, same shape
 * as image/video, optionally suffixed `%N%` the same way an option's points are. Can appear
 * anywhere a question can have content — outside the `{ }` option block (alongside media) or
 * interspersed among the options inside it; either way it's a question-level extra, not tied to
 * any one option. */
export interface QuizScriptReveal {
  label: string;
  content: string;
  points: number;
}

/** A question-level, post-answer explanation: shown on the intermediate/reveal screen once a
 * question is locked in, regardless of whether the player got it right or wrong — unlike
 * `QuizScriptReveal` hints, it has no reveal cost and nothing to click, since it isn't shown until
 * after answering either way. Written `!<analysis>[label](content)`, same bracket/paren shape as
 * media/hints, but with no trailing `%N%` weight (there's no scoring concept for it). At most one
 * per question — a second `!<analysis>[...]` line is a parse error, same closed-set philosophy as
 * `guess_letters` allowing only one accepted answer. */
export interface QuizScriptAnalysis {
  label: string;
  content: string;
}

/** Arbitrary `:key=value` settings attached to a question, e.g. difficulty, shuffle_options. */
export type QuizScriptSettings = Record<string, string | number | boolean>;

export interface QuizScriptQuestion {
  /** Question "type" — defaults to `"question"` (plain multiple choice) when not declared. */
  variant: string;
  text: string;
  media: QuizScriptMedia[];
  options: QuizScriptOption[];
  extras: QuizScriptReveal[];
  /** The question's post-answer explanation (see `QuizScriptAnalysis`) — `undefined` when the
   * author didn't write one. */
  analysis?: QuizScriptAnalysis;
  settings: QuizScriptSettings;
}

export interface QuizScriptError {
  line: number;
  message: string;
}

// `!<image>[alt](url)` is the explicit form; bare `![alt](url)` is the same thing, kept as a
// shorter alias. Video has no bare-marker alias — it's always tagged `!<youtube>[alt](url)`, so
// an option's marker (`=`/`~`) never collides with the media syntax the way a leading `~[...]`
// video line once would have.
const IMAGE_LINE = /^!(?:<image>)?\[(.*)\]\((.*)\)$/;
const VIDEO_LINE = /^!<youtube>\[(.*)\]\((.*)\)$/;
const REVEAL_LINE = /^!<reveal>\[(.*)\]\((.*)\)$/;
const ANALYSIS_LINE = /^!<analysis>\[(.*)\]\((.*)\)$/;
const VARIANT_LINE = /^variant\s*:\s*(.+)$/i;
const SETTING_LINE = /^:([A-Za-z_][\w-]*)\s*=\s*(.*)$/;
const FRONTMATTER_LINE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;
/** `match_pairs`/`group_items` option shape: `item -> target`, split on the FIRST " -> " (non-greedy
 * left side) — a known, documented simplification, same category as `matchTypedGuesses`' own
 * "Known limitation" comment in grading.ts: an item whose own text contains a literal " -> " would
 * split in the wrong place. Quote or backslash-escape the line (see `parseEscaped`) to opt out. */
const OPTION_TARGET = /^(.*?)\s->\s(.*)$/;

/** Variant names recognized as a compact `<name>: text` header. A whitelist rather than "any
 * `word:` prefix" so an ordinary text line that happens to contain an early colon (e.g. a ratio
 * like "Ratio: 3:4") isn't mistaken for a variant declaration. "question" is deliberately absent —
 * it's just the default a question gets by not declaring anything, not a real variant, so a
 * hand-typed `question: ...` header isn't recognized (it just reads as plain question text). */
export const KNOWN_VARIANTS = [
  'pick_one',
  'pick_many',
  'type_answer',
  'type_pattern',
  'guess_letters',
  'order_items',
  'match_pairs',
  'group_items',
  'fill_blanks'
];

const VARIANT_HEADER_LINE = new RegExp(`^(${KNOWN_VARIANTS.join('|')})\\s*:\\s*(.*)$`, 'i');

/** The settings-applicability groups a question variant maps to (see `settingsGroupForVariant`) —
 * the bare/default variant collapses to `'pick_many'`, its most permissive sibling (any
 * number of correct options); `pick_one` gets its own group precisely because some settings
 * (`min_answers`/`max_answers`/`partial_credit`) apply to `pick_many` but never make sense on
 * `pick_one`, which can only ever have zero or one option selected — there's no "some but not
 * all" or "more than one" for any of those three to mean anything for. `order_items`/`match_pairs`/`group_items`/
 * `fill_blanks` each get their own group for the same reason: each has its own shape of "correct
 * answer" (a sequence, a set of pairs, a set of bucket assignments, a set of blank fills) that no
 * existing group's settings were written to describe. */
export type SettingsGroup =
  | 'pick_one'
  | 'pick_many'
  | 'type_answer'
  | 'type_pattern'
  | 'guess_letters'
  | 'order_items'
  | 'match_pairs'
  | 'group_items'
  | 'fill_blanks';

export interface SettingRule {
  kind: 'number' | 'boolean' | 'enum' | 'string';
  /** Every value `validateSettingValue` accepts — only present for `kind: 'enum'`. */
  values?: string[];
  /** Which variant group(s) this setting is meaningful for — checked in `parseQuestionBlock` (a
   * key set on a question outside its `appliesTo` is a parse error) and by
   * `suggestedSettingKeysForVariant` (so a key a question's variant can't use is never even
   * offered). Optional because `QUIZ_SETTING_RULES` shares this same interface for quiz-wide
   * settings, which have no per-question variant to be scoped to — every `SETTING_RULES` (the
   * per-question table) entry always sets it; nothing ever reads it off a `QUIZ_SETTING_RULES`
   * entry. Replaces what used to be two separate type_answer-only/choice-only exclusion lists —
   * those couldn't express a setting spanning exactly two of these four groups, a real need once
   * there's more than a binary split (e.g. `options_layout` applies to both choice variants but
   * neither of the other two; `min_answers` applies to `pick_many`+`type_answer` but not
   * `pick_one`). */
  appliesTo?: readonly SettingsGroup[];
  /** The value a fresh `:key=` line should start out with, for form mode's "pick a key, get a
   * working value" flow (see `settingDefaultValue`) — omitted for settings with no real default
   * (e.g. `min_answers`, `number_tolerance`), where "unset" is itself the meaningful default and
   * there's nothing sensible to pre-fill. Always matches the "Default: ..." line in `description`
   * below — kept as a separate structured field rather than parsed out of that prose. */
  default?: string | number | boolean;
  /** Shown in the "?" hover hint next to this key, in both code and form mode. */
  description: string;
}

/** Known settings with a constrained value — checked in addition to the generic `:key=value`
 * parsing, shared by both the parser (code mode) and the settings form field (form mode) so
 * neither surface can drift from the other. This is a closed set: a key not listed here is a
 * parse error, not a freeform pass-through (see `validateSettingValue`). */
export const SETTING_RULES: Record<string, SettingRule> = {
  points_correct: {
    kind: 'number',
    default: 1,
    appliesTo: [
      'pick_one',
      'pick_many',
      'type_answer',
      'type_pattern',
      'guess_letters',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ],
    description:
      "Points awarded for each correct option/pair/placement that doesn't specify its own %N% weight.\n\nAccepted values: any number\nDefault: 1"
  },
  points_wrong: {
    kind: 'number',
    default: 0,
    appliesTo: [
      'pick_one',
      'pick_many',
      'type_answer',
      'type_pattern',
      'guess_letters',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ],
    description:
      "Points deducted for each incorrect option/pair/placement that doesn't specify its own %N% weight.\n\nAccepted values: any number\nDefault: 0"
  },
  partial_credit: {
    kind: 'boolean',
    default: false,
    appliesTo: [
      'pick_many',
      'type_answer',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ],
    description:
      'Whether getting some (not all) of a question right earns partial credit instead of requiring an exact match — e.g. for a type_answer question with 3 accepted answers, matching only 1 of them awards that one\'s points instead of 0. For order_items/match_pairs/group_items/fill_blanks, "some but not all" means some but not all items/pairs/buckets/blanks placed correctly.\n\nNot meaningful for pick_one: with at most one correct option, there\'s never a "some but not all" scenario for it to apply to. Only meaningful for a multi-guess type_answer question (max_answers > 1) — single-input typed matching has no concept of partial either.\n\nAccepted values: true, false\nDefault: false'
  },
  options_layout: {
    kind: 'enum',
    values: ['list', 'grid2x2', 'grid3x3'],
    default: 'list',
    appliesTo: ['pick_one', 'pick_many'],
    description:
      'How a choice question\'s options are laid out. "list": one per row. "grid2x2": a fixed 2-column grid. "grid3x3": 2 columns on narrow screens, 3 on wider ones.\n\nAccepted values: list, grid2x2, grid3x3\nDefault: list'
  },
  min_answers: {
    kind: 'number',
    appliesTo: ['pick_many', 'type_answer'],
    description:
      'Minimum number of options/answers the player must select or give before they can submit this question. Not meaningful for pick_one, which can only ever have zero or one selected.\n\nAccepted values: any number\nDefault: none — any number given is enough, including zero'
  },
  max_answers: {
    kind: 'number',
    appliesTo: ['pick_many', 'type_answer'],
    description:
      'Maximum number of options/answers the player is allowed to select or give for this question. Not meaningful for pick_one, which can only ever have zero or one selected.\n\nAccepted values: any number\nDefault: none — any number is allowed'
  },
  shuffle_options: {
    kind: 'boolean',
    default: false,
    appliesTo: ['pick_one', 'pick_many'],
    description:
      "For a choice question, whether its options are shown in a random order each time it's played. Not meaningful for a type_answer question.\n\nAccepted values: true, false\nDefault: false"
  },
  difficulty: {
    kind: 'enum',
    values: ['easy', 'medium', 'hard'],
    appliesTo: [
      'pick_one',
      'pick_many',
      'type_answer',
      'type_pattern',
      'guess_letters',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ],
    description:
      "How difficult this question is, for organizing or filtering later — purely informational, doesn't affect grading or play.\n\nAccepted values: easy, medium, hard\nDefault: none"
  },
  match_case: {
    kind: 'boolean',
    default: false,
    appliesTo: [
      'type_answer',
      'type_pattern',
      'order_items',
      'match_pairs',
      'group_items',
      'fill_blanks'
    ],
    description:
      "For a type_answer or type_pattern question (or a fill_blanks question with answer_mode=type), whether a player's answer must match an accepted answer's exact letter case instead of being compared case-insensitively. Other normalization (whitespace, punctuation, accents) always applies regardless of this setting. Not meaningful for guess_letters: the player guesses by clicking a bank letter, not typing text, so there's no \"wrong case\" input to compare against — matching there is always case-insensitive. A no-op on fill_blanks when answer_mode=pick, since picking a bank word is never a case mismatch.\n\nAccepted values: true, false\nDefault: false"
  },
  number_tolerance: {
    kind: 'number',
    appliesTo: ['type_answer', 'order_items', 'match_pairs', 'group_items', 'fill_blanks'],
    description:
      'For a type_answer question (or a fill_blanks question with answer_mode=type), the allowed absolute difference between a numeric answer and a numeric response (e.g. 0.5 lets "3.5" match "3"). Falls back to normalized text comparison when either side isn\'t a number. Cannot be combined with typo_tolerance on the same question. A no-op on fill_blanks when answer_mode=pick.\n\nAccepted values: any number\nDefault: none — numeric-tolerance matching is off'
  },
  typo_tolerance: {
    kind: 'number',
    appliesTo: ['type_answer', 'order_items', 'match_pairs', 'group_items', 'fill_blanks'],
    description:
      "For a type_answer question (or a fill_blanks question with answer_mode=type), how many typos a response may have and still match, as a percentage of the accepted answer's length (edit distance). Cannot be combined with number_tolerance on the same question. A no-op on fill_blanks when answer_mode=pick.\n\nAccepted values: a number from 0 to 100\nDefault: none — fuzzy matching is off"
  },
  typed_input: {
    kind: 'enum',
    // "text", not "field": the default below, this rule's own description, the docs and every
    // example all say `text`, and nothing reads `field` — `grading.ts` and `QuestionPlayer` only
    // ever test for `boxes`. As `['field', 'boxes']` the enum didn't contain its own default, so
    // form mode's "pick a key, get its default value" flow pre-filled `text` and then immediately
    // flagged it as invalid.
    values: ['text', 'boxes'],
    default: 'text',
    appliesTo: ['type_answer'],
    description:
      "How a type_answer question's answer field is displayed: a plain text box, or one box per character (grouped by word) sized to the first accepted answer's shape. Works in both single-answer and multi-guess (max_answers > 1) mode.\n\nAccepted values: text, boxes\nDefault: text"
  },
  letter_bank: {
    kind: 'enum',
    values: ['alphabet', 'auto', 'fixed'],
    default: 'alphabet',
    appliesTo: ['guess_letters'],
    description:
      'Which letters appear in the on-screen letter bank. "alphabet": the full A-Z. "auto": every distinct letter actually in the answer, plus a handful of random decoy letters that aren\'t (so a guess still carries real risk). "fixed": exactly the letters in letter_bank_chars.\n\nAccepted values: alphabet, auto, fixed\nDefault: alphabet'
  },
  letter_bank_chars: {
    kind: 'string',
    appliesTo: ['guess_letters'],
    description:
      'The exact letters offered in the bank — only read when letter_bank=fixed. E.g. "abcdefghijklmnop".\n\nAccepted values: any text\nDefault: none'
  },
  letter_reveal: {
    kind: 'enum',
    values: ['all', 'sequence', 'random'],
    default: 'all',
    appliesTo: ['guess_letters'],
    description:
      'How a correct letter guess reveals its occurrences in the answer. "all": every occurrence at once (classic Hangman), and that letter\'s bank button disables immediately. "sequence"/"random": one not-yet-revealed occurrence per guess (next-in-order, or a random remaining one) — the bank button stays clickable until every occurrence of that letter is revealed.\n\nAccepted values: all, sequence, random\nDefault: all'
  },
  letters_shown_at_start: {
    kind: 'number',
    default: 0,
    appliesTo: ['guess_letters'],
    description:
      'Additional random characters (on top of any explicit [x] pre-reveal brackets in the answer) revealed from the start, free of charge.\n\nAccepted values: any number\nDefault: 0'
  },
  answer_mode: {
    kind: 'enum',
    values: ['pick', 'type'],
    default: 'pick',
    appliesTo: ['order_items', 'match_pairs', 'group_items', 'fill_blanks'],
    description:
      'How the answer is given, for the four variants that place things rather than select them. "pick": the on-screen board — tap an item then tap its target, or drag it there. "type": no board, just a text field per answer, matched the same way a type_answer question\'s response is (match_case/number_tolerance/typo_tolerance all apply). What gets typed depends on the variant: for fill_blanks each blank\'s word, for order the item belonging at each position, and for match/group_items each item\'s target or bucket.\n\nAccepted values: pick, type\nDefault: pick'
  }
};

/** Single source of truth for the key-suggestion list too — see `SETTING_RULES` above.
 *
 * Sorted, rather than left in `SETTING_RULES` declaration order: the table above is grouped by
 * topic (scoring, then choice display, then the typed-matching tolerances, then guess_letters's
 * own cluster), which reads well as documentation but gives an author scanning a dropdown for one
 * remembered name no idea where to look. The table keeps its grouping; only what's OFFERED is
 * alphabetical. */
export const SUGGESTED_SETTING_KEYS = Object.keys(SETTING_RULES).sort();

/** Maps a question's raw `variant` string to the settings-applicability group it behaves as —
 * the bare/default variant collapses to `'pick_many'` (any number of correct options).
 * `pick_one` gets its own group since a few settings apply to `pick_many` but not it —
 * see `SettingsGroup`'s own doc comment. */
function settingsGroupForVariant(variant: string): SettingsGroup {
  if (variant === 'pick_one') return 'pick_one';
  if (variant === 'type_answer') return 'type_answer';
  if (variant === 'type_pattern') return 'type_pattern';
  if (variant === 'guess_letters') return 'guess_letters';
  if (variant === 'order_items') return 'order_items';
  if (variant === 'match_pairs') return 'match_pairs';
  if (variant === 'group_items') return 'group_items';
  if (variant === 'fill_blanks') return 'fill_blanks';
  return 'pick_many';
}

/** Which of `SUGGESTED_SETTING_KEYS` actually apply to a question of this variant — the list a
 * settings-key suggestion dropdown should offer, so an author isn't offered (and can't
 * accidentally pick) a key that `parseQuestionBlock` would immediately reject for this variant. */
export function suggestedSettingKeysForVariant(variant: string): string[] {
  return SUGGESTED_SETTING_KEYS.filter((key) => settingAppliesToVariant(key, variant));
}

/** Whether a per-question setting is meaningful for `variant` — the `appliesTo` check on its own,
 * exported because setting inheritance (see `resolveQuestionSettings`) needs it per question rather
 * than as a whole filtered key list. */
export function settingAppliesToVariant(key: string, variant: string): boolean {
  const rule = SETTING_RULES[key];
  if (!rule) return false;
  return (rule.appliesTo ?? []).includes(settingsGroupForVariant(variant));
}

/** Per-question settings that may ALSO be written once in the quiz frontmatter, where they act as a
 * default for every question that doesn't set them itself (see `resolveQuestionSettings`).
 *
 * The rule is "does this express a policy for the quiz, or the shape of one specific question": a
 * scoring weight, a matching tolerance, a display choice or an input mode is the former and is
 * tedious to repeat on all thirty questions, so all of those inherit. Excluded, deliberately:
 * `min_answers`/`max_answers`, which are counts tied to one question's own option list and mean
 * nothing spread across a bank of questions with different numbers of options; and `difficulty`,
 * which labels an individual question — a quiz-wide difficulty is a property of the quiz, not a
 * default for its parts, and the app doesn't read it for anything yet either way. */
export const INHERITABLE_SETTING_KEYS: readonly string[] = SUGGESTED_SETTING_KEYS.filter(
  (key) => !['min_answers', 'max_answers', 'difficulty'].includes(key)
);

/** Same idea as `SETTING_RULES`, scoped to the whole quiz instead of one question — written as
 * `:key=value` lines inside the `--- ... ---` frontmatter block (see `parseFrontmatter`), edited
 * via the quiz metadata card's own code mode the same way a question's settings are. Also a
 * closed set, validated through the same `validateSettingValue`/`settingValueSuggestions` these
 * take an explicit `rules` table for, precisely so quiz-level and question-level settings share
 * one validation path instead of two drifting copies. */
export const QUIZ_SETTING_RULES: Record<string, SettingRule> = {
  points_to_win: {
    kind: 'number',
    description:
      'Total points a player must reach to "win" this quiz.\n\nAccepted values: any number\nDefault: none — no win threshold (percent_to_win is used instead)'
  },
  percent_to_win: {
    kind: 'number',
    default: 75,
    description:
      'Percentage of the quiz\'s maximum possible score a player must reach to "win".\n\nAccepted values: any number\nDefault: 75'
  },
  shuffle_questions: {
    kind: 'boolean',
    default: true,
    description:
      "Whether this quiz's questions are shown in a random order each run.\n\nAccepted values: true, false\nDefault: true"
  },
  questions_per_run: {
    kind: 'number',
    description:
      'Maximum number of questions shown per run, picked from the question bank when it holds more than this.\n\nAccepted values: any number\nDefault: none — every question is shown'
  },
  reveal_answers: {
    kind: 'enum',
    values: ['after_every_question', 'at_end', 'never'],
    default: 'after_every_question',
    description:
      'When correct answers are revealed to the player during a run. "after_every_question" reveals them the moment each question is submitted, and locks that question — no going back. "at_end" holds every answer back until the whole quiz is submitted, and lets the player move freely between questions (with a confirmation before the final submit) until then. "never" reveals nothing, even in the end-of-quiz review.\n\nAccepted values: after_every_question, at_end, never\nDefault: after_every_question'
  },
  reveal_scores: {
    kind: 'enum',
    values: ['after_every_question', 'at_end', 'never'],
    default: 'after_every_question',
    description:
      'When points earned are revealed to the player, independently of reveal_answers (e.g. show a running score without spoiling which options were correct). "after_every_question" shows each question\'s points the moment it\'s submitted — like reveal_answers, this alone is enough to lock that question with no going back. "at_end" only shows the total (and any per-question breakdown) once the quiz is submitted. "never" never shows any point value.\n\nAccepted values: after_every_question, at_end, never\nDefault: after_every_question'
  },
  show_running_score: {
    kind: 'boolean',
    default: true,
    description:
      'Whether a persistent "earned / total" score is shown at the top of the screen throughout the run, updating as questions are answered. The total is always the quiz\'s full achievable points (knowable upfront, regardless of progress); the earned side follows reveal_scores — shown live when reveal_scores=after_every_question, otherwise masked as "? / total" until the quiz is submitted, so this never reveals anything reveal_scores is holding back.\n\nAccepted values: true, false\nDefault: true'
  },
  show_reveal_screen: {
    kind: 'boolean',
    default: true,
    description:
      'Whether answering a question pauses on its own reveal screen (with a "Next question" button) before moving on, when something is revealed live (reveal_answers or reveal_scores set to after_every_question). Set to false to skip that pause and jump straight to the next question instead — the earned points for that question flash briefly next to the top score (show_running_score) rather than getting a full screen.\n\nCannot be false when reveal_answers=after_every_question — showing which options were correct needs a real screen, not just a flash; reveal_scores=after_every_question alone is unaffected either way.\n\nAccepted values: true, false\nDefault: true'
  },
  timer_mode: {
    kind: 'enum',
    values: ['off', 'per_question', 'per_quiz'],
    default: 'off',
    description:
      'Whether answering is under a time limit, and how it\'s scoped. "off": no timer. "per_question": timer_seconds seconds per question, resetting for each one. "per_quiz": one timer_seconds-second budget shared across the whole run. Requires timer_seconds to be set. "per_question" additionally requires reveal_answers or reveal_scores set to after_every_question — a per-question time limit only makes sense alongside "answering this locks it in immediately", which is exactly what that combination already means.\n\nAccepted values: off, per_question, per_quiz\nDefault: off'
  },
  timer_seconds: {
    kind: 'number',
    description:
      'Seconds on the clock — per question (timer_mode=per_question) or for the whole run (timer_mode=per_quiz). Only read when timer_mode isn\'t "off".\n\nAccepted values: any number\nDefault: none'
  },
  on_timeout: {
    kind: 'enum',
    values: ['auto_submit', 'lock_zero'],
    default: 'auto_submit',
    description:
      'What happens to a question still being answered when its clock reaches zero (a per_question timer running out, or a per_quiz budget running out while a question is live). "auto_submit": whatever\'s currently selected/typed is submitted and graded as-is, same as clicking Submit. "lock_zero": the question locks with no credit, regardless of any partial selection/input.\n\nAccepted values: auto_submit, lock_zero\nDefault: auto_submit'
  },
  reveal_screen_seconds: {
    kind: 'number',
    description:
      'Seconds the post-answer reveal screen waits before automatically advancing to the next question (or to results, on the last one) — a live countdown is shown next to the "Next question"/"See results" button. Unset: no auto-advance, the player clicks through manually. Requires show_reveal_screen to not be false — there\'s no screen to auto-advance from otherwise.\n\nAccepted values: any number\nDefault: none — no auto-advance'
  }
};

/** Everything the quiz frontmatter accepts: the quiz-only settings above, plus every inheritable
 * per-question setting acting as a default (see `INHERITABLE_SETTING_KEYS`). One table so
 * `parseFrontmatter`, the builder's key dropdown, value validation and `SettingHelp`'s descriptions
 * all agree on what's allowed up there — a quiz-wide `:shuffle_options=true` has to validate against
 * the same rule the per-question key does, or the two could drift into accepting different values
 * for the same name. */
export const QUIZ_FRONTMATTER_RULES: Record<string, SettingRule> = {
  ...QUIZ_SETTING_RULES,
  ...Object.fromEntries(INHERITABLE_SETTING_KEYS.map((key) => [key, SETTING_RULES[key]]))
};

/** Alphabetical for the same reason as `SUGGESTED_SETTING_KEYS` — and doubly so here, since the
 * unsorted order would be "every quiz-only setting, then every inherited per-question one", a split
 * that means nothing to an author who just wants to find `shuffle_questions`. */
export const QUIZ_SUGGESTED_SETTING_KEYS = Object.keys(QUIZ_FRONTMATTER_RULES).sort();

/** A question's effective settings: the quiz-wide defaults it inherits, with its OWN settings
 * layered on top so anything written on the question always wins.
 *
 * Only inheritable keys (see `INHERITABLE_SETTING_KEYS`) are considered, and only when they apply
 * to this question's variant — so a quiz-wide `:letter_bank=auto` reaches the guess_letters
 * questions and is silently irrelevant to the rest, rather than landing on a `type_answer` question as a
 * setting that variant would have rejected if authored there directly.
 *
 * Resolved once per run, in `buildPlayRun`, so everything downstream (grading, the boards, the
 * reveal screen) reads one already-merged `settings` object and no consumer has to remember to
 * check two places. */
export function resolveQuestionSettings(
  question: QuizScriptQuestion,
  quizSettings: QuizScriptSettings
): QuizScriptSettings {
  const inherited: QuizScriptSettings = {};
  for (const [key, value] of Object.entries(quizSettings)) {
    if (!INHERITABLE_SETTING_KEYS.includes(key)) continue;
    if (!settingAppliesToVariant(key, question.variant)) continue;
    inherited[key] = value;
  }
  return { ...inherited, ...question.settings };
}

/** The discrete values a constrained setting's VALUE field should suggest — "easy"/"medium"/
 * "hard" for difficulty, "true"/"false" for a boolean key. Empty for numeric or unknown keys.
 * `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for the quiz-wide one. */
export function settingValueSuggestions(
  key: string,
  rules: Record<string, SettingRule> = SETTING_RULES
): string[] {
  const rule = rules[key];
  if (!rule) return [];
  return rule.kind === 'boolean' ? ['true', 'false'] : (rule.values ?? []);
}

/** The value a fresh `:key=` line should start out with once `key` is picked in form mode —
 * `String(rule.default)`, or `''` for a key with no real default (see `SettingRule.default`'s own
 * doc comment) so the value field is left blank rather than filled with something misleading.
 * `rules` defaults to the per-question table; pass `QUIZ_SETTING_RULES` for the quiz-wide one. */
export function settingDefaultValue(
  key: string,
  rules: Record<string, SettingRule> = SETTING_RULES
): string {
  const rule = rules[key];
  return rule?.default !== undefined ? String(rule.default) : '';
}

export interface SettingValidation {
  value: string | number | boolean;
  /** Present when `raw` doesn't satisfy the key's rule. `value` is still a best-effort fallback
   * (via the generic `coerceSetting`) so a bad value doesn't just vanish from the question. */
  error?: string;
}

/** Trailing `%N%` point annotation on an option, e.g. "Water %4%" or "Salt %-1%". */
const OPTION_POINTS = /^(.*?)\s*%(-?\d+(?:\.\d+)?)%$/;

/** Exported so a form-mode option field can detect the same `![alt](url)` / `!<image>[alt](url)`
 * / `!<youtube>[alt](url)` shape as code mode and switch that option to image/video kind live,
 * rather than requiring the kind dropdown to be used first. */
export function parseOptionContent(text: string): QuizScriptOptionContent {
  const image = IMAGE_LINE.exec(text);
  if (image) return { kind: 'image', alt: image[1], url: image[2] };
  const video = VIDEO_LINE.exec(text);
  if (video) return { kind: 'video', alt: video[1], url: video[2] };
  return { kind: 'text', text };
}

/** `guess_letters`-only: strips `[X]` pre-reveal markers from a raw accepted-answer line,
 * returning the plain text plus the (stripped-text-relative) index of each marked character —
 * e.g. `"[P]a[r]is"` → `{ text: "Paris", prerevealed: [0, 2] }`. Only a single character inside
 * the brackets is recognized (`[Pa]` isn't treated specially — its brackets stay as literal
 * characters in the answer text, same as any other shape this format doesn't recognize). */
function parsePrerevealedText(raw: string): { text: string; prerevealed: number[] } {
  const prerevealed: number[] = [];
  let text = '';
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '[' && raw[i + 2] === ']') {
      prerevealed.push(text.length);
      text += raw[i + 1];
      i += 3;
    } else {
      text += raw[i];
      i++;
    }
  }
  return { text, prerevealed };
}

/** Inverse of `parsePrerevealedText` — re-inserts `[X]` markers at the given (text-relative)
 * indices, so a `guess_letters` option round-trips through serialization unchanged. */
function insertPrerevealMarkers(text: string, prerevealed: number[] | undefined): string {
  if (!prerevealed || prerevealed.length === 0) return text;
  const marked = new Set(prerevealed);
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += marked.has(i) ? `[${text[i]}]` : text[i];
  }
  return out;
}

function parseOption(rest: string, correct: boolean): QuizScriptOption {
  const trimmed = rest.trim();
  const escaped = parseEscaped(trimmed);
  if (escaped !== null) return { content: { kind: 'text', text: escaped }, correct };
  const match = OPTION_POINTS.exec(trimmed);
  if (!match) return { content: parseOptionContent(trimmed), correct };
  return { content: parseOptionContent(match[1].trim()), correct, points: Number(match[2]) };
}

/** A `!<reveal>[label](content)` line, optionally suffixed `%N%` for its reveal cost (same
 * trailing-weight annotation an option uses) — `null` if `text` isn't shaped like one at all, so
 * callers can fall through to whatever else a line might be. Unlike option points, an omitted
 * `%N%` here just means "free hint" (0), not "defer to a question-level setting" — reveal has no
 * such setting to defer to. */
function parseRevealLine(text: string): QuizScriptReveal | null {
  const weighted = OPTION_POINTS.exec(text);
  const points = weighted ? Number(weighted[2]) : 0;
  const target = weighted ? weighted[1].trim() : text;
  const match = REVEAL_LINE.exec(target);
  if (!match) return null;
  return { label: match[1], content: match[2], points };
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

function isQuoted(value: string): boolean {
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  );
}

/** Forces a line (or an option's content, after its `=`/`~` marker is stripped) to be read as
 * literal text, bypassing every other special-syntax check — image/video/reveal media, option
 * point weights, `:key=value` settings, `variant :`/compact-header lines. Two equivalent forms:
 * wrap the whole thing in matching quotes (`"50% off, no really"`), or escape just the leading
 * character with a backslash (`\=5` for text that starts with a literal `=`) — whichever reads
 * better for a given piece of content. Returns `null` (not escaped at all) so callers can fall
 * through to their normal dispatch. */
function parseEscaped(text: string): string | null {
  if (text.startsWith('\\')) return text.slice(1);
  if (isQuoted(text)) return stripQuotes(text);
  return null;
}

/** Exported so a settings form field can apply the exact same typing rules as `:key=value`
 * source (quoting still escapes to a literal string) rather than a parallel, drifting copy. */
export function coerceSetting(raw: string): string | number | boolean {
  // Quoting is the escape hatch: `:key="true"` stays the literal string "true" instead of
  // coercing to a boolean, same intent as quoting a numeric-looking string.
  if (isQuoted(raw)) return stripQuotes(raw);
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value !== '' && !Number.isNaN(Number(value))) return Number(value);
  return value;
}

/** Applies a known key's stricter rule (see `SETTING_RULES`) on top of the generic `:key=value`
 * typing above — shared by `parseQuestionBlock` (code mode) and the settings form field (form
 * mode), so both surfaces agree on what counts as valid for points_correct/points_wrong/shuffle_options/etc. Settings
 * are a closed set: a key outside `rules` is an error, not a freeform pass-through. `rules`
 * defaults to the per-question table; pass `QUIZ_SETTING_RULES` to validate a quiz-wide setting
 * instead — same function either way, so the two never drift into disagreeing validation. */
export function validateSettingValue(
  key: string,
  raw: string,
  rules: Record<string, SettingRule> = SETTING_RULES
): SettingValidation {
  const rule = rules[key];
  if (!rule) {
    return {
      value: coerceSetting(raw),
      error: `is not a recognized setting (must be one of ${Object.keys(rules).join('/')})`
    };
  }

  const trimmed = stripQuotes(raw).trim();

  if (rule.kind === 'number') {
    if (trimmed === '' || Number.isNaN(Number(trimmed))) {
      return { value: coerceSetting(raw), error: `must be a number (got "${trimmed}")` };
    }
    return { value: Number(trimmed) };
  }

  if (rule.kind === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === 'yes') return { value: true };
    if (lower === 'false' || lower === 'no') return { value: false };
    return { value: coerceSetting(raw), error: `must be true/false or yes/no (got "${trimmed}")` };
  }

  // A free-form string setting (currently just `letter_bank_chars`) — any value is accepted
  // as-is, never coerced to a number/boolean the way the generic `:key=value` fallback would
  // (coerceSetting), since e.g. a bank of only digit characters must stay a literal string.
  if (rule.kind === 'string') {
    return { value: trimmed };
  }

  const lower = trimmed.toLowerCase();
  if (rule.values!.includes(lower)) return { value: lower };
  return {
    value: coerceSetting(raw),
    error: `must be one of ${rule.values!.join('/')} (got "${trimmed}")`
  };
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (inner.trim() === '') return [];
  return inner
    .split(',')
    .map((item) => stripQuotes(item))
    .filter((item) => item.length > 0);
}

/** Title/description/category are each confined to one physical frontmatter line, but
 * description in particular comes from a multi-line `<textarea>` in the metadata form — so a
 * real newline has to survive round-tripping through code mode without splitting the line in
 * two. Backslash-escaped the same way a string literal would be: `\` first (so a literal
 * backslash in the text is never mistaken for the start of an escape), then newline as `\n`. */
function escapeFrontmatterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}
function unescapeFrontmatterValue(value: string): string {
  return value.replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

function parseFrontmatter(
  lines: string[],
  errors: QuizScriptError[]
): { frontmatter: QuizScriptFrontmatter; bodyStart: number } {
  const frontmatter: QuizScriptFrontmatter = {
    title: '',
    description: '',
    category: '',
    tags: [],
    settings: {}
  };

  if (lines[0]?.trim() !== '---') return { frontmatter, bodyStart: 0 };

  const closingIndex = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (closingIndex === -1) {
    errors.push({ line: 1, message: 'Frontmatter is opened with "---" but never closed.' });
    return { frontmatter, bodyStart: 0 };
  }

  for (let i = 1; i < closingIndex; i++) {
    const raw = lines[i];
    if (raw.trim() === '') continue;

    const settingMatch = SETTING_LINE.exec(raw.trim());
    if (settingMatch) {
      const key = settingMatch[1];
      const { value, error } = validateSettingValue(key, settingMatch[2], QUIZ_FRONTMATTER_RULES);
      frontmatter.settings[key] = value;
      if (error) errors.push({ line: i + 1, message: `Setting "${key}" ${error}.` });
      continue;
    }

    const match = FRONTMATTER_LINE.exec(raw);
    if (!match) {
      errors.push({ line: i + 1, message: `Unrecognized frontmatter line: "${raw}"` });
      continue;
    }
    const [, key, value] = match;
    switch (key) {
      case 'title':
        frontmatter.title = unescapeFrontmatterValue(stripQuotes(value));
        break;
      case 'description':
        frontmatter.description = unescapeFrontmatterValue(stripQuotes(value));
        break;
      case 'category':
        frontmatter.category = unescapeFrontmatterValue(stripQuotes(value));
        break;
      case 'tags':
        frontmatter.tags = parseInlineArray(value);
        break;
      default:
        errors.push({ line: i + 1, message: `Unknown frontmatter field "${key}".` });
    }
  }

  // `show_reveal_screen=false` skips the per-question pause entirely (see
  // QuizPlayer.svelte) — fine when only `reveal_scores=after_every_question` is live (a brief
  // score flash is enough), but `reveal_answers=after_every_question` needs a real screen to show
  // which options were actually correct, which a flash can't convey. So the latter always forces
  // an intermediate screen, regardless of what `show_reveal_screen` was set to. Checked
  // against `reveal_answers`'s own default too (unset means "after_every_question" — see
  // QUIZ_SETTING_RULES) since an *effective* after_every_question is what actually matters here,
  // not just an explicitly-written one.
  const revealAnswers = frontmatter.settings.reveal_answers ?? 'after_every_question';
  if (
    revealAnswers === 'after_every_question' &&
    frontmatter.settings.show_reveal_screen === false
  ) {
    errors.push({
      line: 1,
      message:
        '"show_reveal_screen" cannot be false when "reveal_answers" is "after_every_question" — revealing which options were correct needs a real screen, not just a flash.'
    });
  }

  // `points_to_win` always wins over `percent_to_win` when both are set (see
  // gradeRun) — so setting both isn't a conflict grading can't resolve, but it does mean
  // percent_to_win is silently dead, which an author almost certainly didn't intend.
  // Same category of "you set two things that can't both take effect" as number_tolerance/
  // typo_tolerance being mutually exclusive on a question, just at the quiz-wide level instead.
  if ('points_to_win' in frontmatter.settings && 'percent_to_win' in frontmatter.settings) {
    errors.push({
      line: 1,
      message:
        '"points_to_win" and "percent_to_win" can\'t both be set — "points_to_win" always wins, silently ignoring the other. Remove one.'
    });
  }

  // A timer needs a duration to count down from — timer_mode alone doesn't say how long.
  const timerMode = frontmatter.settings.timer_mode;
  if (
    (timerMode === 'per_question' || timerMode === 'per_quiz') &&
    typeof frontmatter.settings.timer_seconds !== 'number'
  ) {
    errors.push({
      line: 1,
      message: `"timer_seconds" is required when "timer_mode" is "${timerMode}".`
    });
  }

  // A per_question timer only makes sense alongside "submitting a question locks it in
  // immediately" (see QuizPlayer.svelte's `locksAnswerImmediately`) — in free-navigation
  // ("at_end"/"never" for both) mode there's no per-question submit event for a per-question
  // clock to even attach to. A per_quiz timer has no such requirement: it just ends the whole
  // run when the shared budget runs out, regardless of navigation mode.
  if (timerMode === 'per_question') {
    const effectiveRevealScores = frontmatter.settings.reveal_scores ?? 'after_every_question';
    if (
      revealAnswers !== 'after_every_question' &&
      effectiveRevealScores !== 'after_every_question'
    ) {
      errors.push({
        line: 1,
        message:
          '"timer_mode" of "per_question" requires "reveal_answers" or "reveal_scores" set to "after_every_question" — a per-question time limit only makes sense when answering a question locks it in immediately.'
      });
    }
  }

  // No screen to auto-advance from otherwise.
  if (
    'reveal_screen_seconds' in frontmatter.settings &&
    frontmatter.settings.show_reveal_screen === false
  ) {
    errors.push({
      line: 1,
      message:
        '"reveal_screen_seconds" can\'t be set when "show_reveal_screen" is false — there\'s no reveal screen to auto-advance from.'
    });
  }

  return { frontmatter, bodyStart: closingIndex + 1 };
}

interface SourceLine {
  text: string;
  num: number;
}

/** Splits the body into per-question line groups on blank lines, ignoring blank lines that
 * fall inside a `{ }` option block so multi-line-formatted options don't fracture a question. */
function splitQuestionBlocks(lines: string[], start: number): SourceLine[][] {
  const blocks: SourceLine[][] = [];
  let current: SourceLine[] = [];
  let depth = 0;

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current);
      current = [];
    }
  };

  for (let i = start; i < lines.length; i++) {
    const text = lines[i].trim();
    if (text === '{') depth++;
    if (text === '}') depth = Math.max(0, depth - 1);

    if (text === '' && depth === 0) {
      flush();
      continue;
    }
    current.push({ text, num: i + 1 });
  }
  flush();

  return blocks;
}

function parseQuestionBlock(block: SourceLine[], errors: QuizScriptError[]): QuizScriptQuestion {
  const question: QuizScriptQuestion = {
    variant: 'question',
    text: '',
    media: [],
    options: [],
    extras: [],
    settings: {}
  };
  const textLines: string[] = [];

  let i = 0;
  while (i < block.length) {
    const { text, num } = block[i];

    if (text === '{') {
      const openLine = num;
      i++;
      while (i < block.length && block[i].text !== '}') {
        const opt = block[i];
        let reveal: QuizScriptReveal | null;
        if (opt.text === '') {
          i++;
          continue;
        }
        if (opt.text.startsWith('=')) {
          question.options.push(parseOption(opt.text.slice(1), true));
        } else if (opt.text.startsWith('~')) {
          question.options.push(parseOption(opt.text.slice(1), false));
        } else if ((reveal = parseRevealLine(opt.text))) {
          // A hint interspersed among the options — still a question-level extra (see
          // QuizScriptReveal), just written here for authoring convenience; it has no `=`/`~`
          // marker of its own since it isn't an answer choice.
          question.extras.push(reveal);
        } else if (opt.text === '{') {
          // Blocks never nest in this format — seeing a second "{" while still scanning options
          // means the first one was never closed, which also explains why the blank line that
          // should have separated these into two questions didn't: it landed "inside" the block.
          errors.push({
            line: openLine,
            message:
              'Option block opened with "{" was never closed with "}" before another "{" started.'
          });
        } else {
          errors.push({
            line: opt.num,
            message: `Expected an option starting with "=" or "~", got: "${opt.text}"`
          });
        }
        i++;
      }
      if (i >= block.length) {
        errors.push({
          line: openLine,
          message: 'Option block opened with "{" but never closed with "}".'
        });
      }
      i++; // consume the closing '}'
      continue;
    }

    let match: RegExpExecArray | null;
    let reveal: QuizScriptReveal | null;
    let escaped: string | null;
    if ((escaped = parseEscaped(text)) !== null) {
      textLines.push(escaped);
    } else if ((match = VARIANT_LINE.exec(text))) {
      const value = match[1].trim().toLowerCase();
      if (!(KNOWN_VARIANTS as string[]).includes(value)) {
        errors.push({
          line: num,
          message: `Unknown variant "${match[1].trim()}" (must be one of ${KNOWN_VARIANTS.join('/')}).`
        });
      }
      question.variant = value;
    } else if ((match = VARIANT_HEADER_LINE.exec(text))) {
      question.variant = match[1].toLowerCase();
      if (match[2].trim() !== '') textLines.push(match[2]);
    } else if ((match = IMAGE_LINE.exec(text))) {
      question.media.push({ kind: 'image', alt: match[1], url: match[2] });
    } else if ((match = VIDEO_LINE.exec(text))) {
      question.media.push({ kind: 'video', alt: match[1], url: match[2] });
    } else if ((reveal = parseRevealLine(text))) {
      question.extras.push(reveal);
    } else if ((match = ANALYSIS_LINE.exec(text))) {
      if (question.analysis) {
        errors.push({
          line: num,
          message: 'A question can only have one "!<analysis>" line — remove the extra one(s).'
        });
      } else {
        question.analysis = { label: match[1], content: match[2] };
      }
    } else if ((match = SETTING_LINE.exec(text))) {
      const key = match[1];
      const { value, error } = validateSettingValue(key, match[2]);
      question.settings[key] = value;
      if (error) errors.push({ line: num, message: `Setting "${key}" ${error}.` });
    } else {
      textLines.push(text);
    }
    i++;
  }

  question.text = textLines.join('\n').trim();

  const firstLine = block[0]?.num ?? 0;

  // A type_answer question's options are accepted answers, not right/wrong choices — every one of
  // them is implicitly correct regardless of its `=`/`~` marker, so this is a hard, self-healing
  // invariant rather than something grading/UI code ever has to check for. Image/video content
  // isn't meaningful for an accepted answer (it's compared as typed text), so that's a real parse
  // error instead of being silently dropped — a hand-edited `=![...]` under `type_answer` is far more
  // likely a mistake than something an author wants ignored.
  if (question.variant === 'type_answer') {
    for (const option of question.options) {
      if (option.content.kind !== 'text') {
        errors.push({
          line: firstLine,
          message:
            "Typed question options must be plain text — an image/video accepted answer isn't meaningful here."
        });
      }
    }
    question.options = question.options.map((o) => ({ ...o, correct: true }));
  }

  // A type_pattern question's options are regular expressions, not literal answers — and unlike
  // every other typed variant, its `=`/`~` markers are LOAD-BEARING rather than decorative: `=`
  // patterns describe what counts as right, `~` patterns describe responses the author wants to
  // explicitly mark wrong (a common misconception, a near-miss spelling). So no `correct: true`
  // normalization here, deliberately.
  //
  // An uncompilable pattern is a parse error rather than a pattern that silently never matches:
  // an author who typed `(a|b` wrote a bug, and a question whose answer key can't ever fire looks
  // identical to one the player simply keeps getting wrong.
  if (question.variant === 'type_pattern') {
    for (const option of question.options) {
      if (option.content.kind !== 'text') {
        errors.push({
          line: firstLine,
          message:
            "type_pattern options must be plain text — an image/video pattern isn't meaningful here."
        });
        continue;
      }
      try {
        new RegExp(option.content.text);
      } catch {
        errors.push({
          line: firstLine,
          message: `"${option.content.text}" isn't a valid regular expression.`
        });
      }
    }
    // Without one, nothing the player types could ever be right — the `~` patterns alone only
    // describe ways to be wrong.
    if (!question.options.some((o) => o.correct)) {
      errors.push({
        line: firstLine,
        message: 'A type_pattern question needs at least one "=" pattern that counts as correct.'
      });
    }
  }

  // Same "every option is an accepted answer, forced correct" invariant as `type_answer` above, plus
  // stripping this variant's own `[X]` pre-reveal marker syntax out of the answer text (see
  // `parsePrerevealedText`) — only meaningful/parsed for `guess_letters`, so a literal `[P]aris`
  // typed into a `choice`/`type_answer` option stays exactly that: plain text, brackets included.
  if (question.variant === 'guess_letters') {
    for (const option of question.options) {
      if (option.content.kind !== 'text') {
        errors.push({
          line: firstLine,
          message:
            "guess_letters options must be plain text — an image/video accepted answer isn't meaningful here."
        });
      }
    }
    question.options = question.options.map((o) => {
      if (o.content.kind !== 'text') return { ...o, correct: true };
      const { text, prerevealed } = parsePrerevealedText(o.content.text);
      return {
        ...o,
        content: { kind: 'text' as const, text },
        correct: true,
        prerevealed: prerevealed.length > 0 ? prerevealed : undefined
      };
    });

    // `letter_bank=fixed` with no (or no letter-containing) `letter_bank_chars` produces a
    // completely empty bank — an unplayable question with nothing to click, not a merely-degraded
    // one, so this is worth a hard error rather than silently shipping something the player can
    // never actually answer. Checked with the same `\p{L}` rule `isGuessableChar` (grading.ts)
    // uses, so "letter_bank_chars=123" (digits only) is caught too, not just an empty string.
    if (question.settings.letter_bank === 'fixed') {
      const chars =
        typeof question.settings.letter_bank_chars === 'string'
          ? question.settings.letter_bank_chars
          : '';
      if (![...chars].some((c) => /\p{L}/u.test(c))) {
        errors.push({
          line: firstLine,
          message:
            '"letter_bank=fixed" requires "letter_bank_chars" to list at least one letter — got none.'
        });
      }
    }
  }

  // order has no right/wrong item, only a right/wrong POSITION — every listed item is
  // implicitly correct by construction, same "hard, self-healing invariant" as typed above.
  // Unlike typed/guess_letters, image/video content is left alone: ordering pictures
  // chronologically is a perfectly sensible use of this variant, and nothing here needs to
  // string-compare an item's content the way typed/guess_letters matching does.
  if (question.variant === 'order_items') {
    question.options = question.options.map((o) => ({ ...o, correct: true }));
    if (question.options.length < 2) {
      errors.push({
        line: firstLine,
        message: '"order_items" needs at least 2 items — a single item has no meaningful order.'
      });
    }
  }

  // match/group_items share the same `item -> target` option syntax (see `OPTION_TARGET`) — every
  // listed pair is implicitly correct by construction, same invariant as order/typed/
  // guess_letters above.
  //
  // Both halves go back through `parseOptionContent` AFTER the split, which is what lets either
  // side be a picture: `=![Eiffel](…) -> France` reaches here as one text option, because
  // IMAGE_LINE/VIDEO_LINE are end-anchored and the ` -> France` tail stops them matching the whole
  // line. Splitting first and re-parsing each half is the only order that works — parsing first
  // would classify the pair as text and never look again.
  if (question.variant === 'match_pairs' || question.variant === 'group_items') {
    question.options = question.options.map((o) => {
      if (o.content.kind !== 'text') return { ...o, correct: true };
      const targetMatch = OPTION_TARGET.exec(o.content.text);
      if (!targetMatch) return { ...o, correct: true };
      return {
        ...o,
        content: parseOptionContent(targetMatch[1].trim()),
        correct: true,
        target: parseOptionContent(targetMatch[2].trim())
      };
    });
    if (question.options.some((o) => o.target === undefined)) {
      errors.push({
        line: firstLine,
        message: `Every "${question.variant}" option needs a "-> target" pairing, e.g. "=Paris -> France".`
      });
    }
    if (question.options.length < 2) {
      errors.push({
        line: firstLine,
        message: `"${question.variant}" needs at least 2 items.`
      });
    }
    // A bucket label is what several items are compared against and deduplicated by (see
    // `categoriseBuckets`), so it has to read as one name — a picture has no stable identity to
    // group by. match_pairs has no such constraint: its right column is one entry per option.
    if (question.variant === 'group_items') {
      for (const option of question.options) {
        if (option.target && option.target.kind !== 'text') {
          errors.push({
            line: firstLine,
            message:
              '"group_items" buckets must be plain text — an image/video names no group for its items to share. The items themselves can be pictures.'
          });
        }
      }
    }
    // Only meaningful for match: a duplicated target would make more than one left-side item
    // "correctly" pair with the same right-side entry, which the 1-to-1 pairing this variant
    // renders (one right-column slot per target) can't actually represent. group_items has no such
    // constraint — many items sharing one target/bucket is the entire point of that variant.
    if (question.variant === 'match_pairs') {
      const targets = question.options
        .map((o) => o.target)
        .filter((t) => t !== undefined)
        .map(optionContentKey);
      const duplicates = targets.filter((t, i) => targets.indexOf(t) !== i);
      if (duplicates.length > 0) {
        errors.push({
          line: firstLine,
          message: `"match_pairs" targets must be unique — "${duplicates[0]}" is paired with more than one item.`
        });
      }
    }
  }

  // fill_blanks' `text` embeds its blanks as `___` tokens, filled left-to-right by this
  // question's correct ("=") options in order — unlike typed/guess_letters/order/match/
  // group_items, the `=`/`~` marker stays meaningful here: `~` options are distractor words added
  // to the word bank with no blank of their own, exactly mirroring how `type_answer`'s own marker
  // convention would work if typed didn't force every option correct.
  if (question.variant === 'fill_blanks') {
    // A bank word can be a picture — "which of these photographs goes in the gap" is a real cloze
    // question — because picking one records WHICH option went where rather than the word's text
    // (see grading.ts's `blankPicks`). Under `answer_mode=type` there's no bank to pick from and a
    // picture has to be typed as its alt text instead (see `typedSlotExpectations`), so this only
    // objects when the question asks for typing AND leaves a picture with nothing to type.
    if (question.settings.answer_mode === 'type') {
      for (const option of question.options) {
        if (option.correct && option.content.kind !== 'text' && option.content.alt.trim() === '') {
          errors.push({
            line: firstLine,
            message:
              'A "fill_blanks" blank answered by typing (answer_mode=type) needs words to type — give this image/video alt text, or drop answer_mode=type to pick it off a word bank instead.'
          });
        }
      }
    }
    const blankCount = (question.text.match(/___/g) ?? []).length;
    const answerCount = question.options.filter((o) => o.correct).length;
    if (blankCount === 0) {
      errors.push({
        line: firstLine,
        message: 'fill_blanks needs at least one "___" blank in the question text.'
      });
    } else if (blankCount !== answerCount) {
      errors.push({
        line: firstLine,
        message: `fill_blanks has ${blankCount} blank(s) in the text but ${answerCount} correct ("=") option(s) — these must match, one answer per blank in order.`
      });
    }
  }

  if (question.options.length === 0) {
    errors.push({ line: firstLine, message: 'Question has no options.' });
  } else if (!question.options.some((o) => o.correct)) {
    errors.push({ line: firstLine, message: 'Question has no option marked correct ("=").' });
  } else if (
    question.variant === 'pick_one' &&
    question.options.filter((o) => o.correct).length > 1
  ) {
    errors.push({
      line: firstLine,
      message:
        '"pick_one" requires exactly one correct option ("=") — use "pick_many" for more than one.'
    });
  } else if (question.variant === 'guess_letters' && question.options.length > 1) {
    errors.push({
      line: firstLine,
      message:
        '"guess_letters" allows exactly one accepted answer ("=") — the guess mechanic is one fixed board of boxes/pre-reveals, so a second answer would have nothing to represent it. Remove the extra line(s).'
    });
  }

  // Checked by key *presence*, not truthiness, so e.g. `:number_tolerance=0` still counts as
  // "set". Worded without a leading `Setting "` so QuestionForm.svelte's formErrors (which
  // filters out lines starting with that, since those are already shown inline under their own
  // row) doesn't swallow this whole-question error.
  if ('number_tolerance' in question.settings && 'typo_tolerance' in question.settings) {
    errors.push({
      line: firstLine,
      message:
        'A question can\'t set both "number_tolerance" and "typo_tolerance" — pick one matching strategy.'
    });
  }

  // Every setting declares which variant group(s) it's meaningful for (`SettingRule.appliesTo`) —
  // a key set outside its own group(s) is always a mistake, not just a no-op, so it's a parse
  // error rather than something silently ignored. A single pass covers every group uniformly
  // (this used to be two separate type_answer-only/choice-only checks, which couldn't express a setting
  // like `match_case` applying to typed AND guess_letters but not choice). Unrecognized keys
  // aren't checked here — `validateSettingValue` already flagged those separately. Same "no
  // leading `Setting "`" wording rule as the check above, for the same reason.
  {
    const group = settingsGroupForVariant(question.variant);
    for (const key of Object.keys(question.settings)) {
      const rule = SETTING_RULES[key];
      const appliesTo = rule?.appliesTo ?? [];
      if (rule && !appliesTo.includes(group)) {
        errors.push({
          line: firstLine,
          message: `"${key}" only applies to ${appliesTo.join('/')} questions (this question's variant is "${question.variant}").`
        });
      }
    }
  }

  // `min_answers`/`max_answers` bound how many options a choice question's player can select, or how
  // many guesses a multi-guess type_answer question's player can give — either way, neither can
  // meaningfully exceed how many options/accepted answers actually exist (e.g. a single accepted
  // answer with `max_answers=2` promises a second guess slot that can never correspond to anything),
  // and a min above a max is simply an unsatisfiable range. Checked purely against declared values
  // regardless of variant, mirroring how `number_tolerance`/`typo_tolerance` above is checked
  // without caring which variant it's actually meaningful for.
  const minAnswers = question.settings.min_answers;
  const maxAnswers = question.settings.max_answers;
  if (typeof minAnswers === 'number' && typeof maxAnswers === 'number' && minAnswers > maxAnswers) {
    errors.push({
      line: firstLine,
      message: '"min_answers" cannot be greater than "max_answers".'
    });
  }
  if (typeof maxAnswers === 'number' && maxAnswers > question.options.length) {
    errors.push({
      line: firstLine,
      message: `"max_answers" (${maxAnswers}) cannot be greater than the number of options/accepted answers (${question.options.length}).`
    });
  }
  if (typeof minAnswers === 'number' && minAnswers > question.options.length) {
    errors.push({
      line: firstLine,
      message: `"min_answers" (${minAnswers}) cannot be greater than the number of options/accepted answers (${question.options.length}).`
    });
  }

  // Without `partial_credit`, grading requires an exact match — every correct option (choice) or
  // accepted answer (typed, where every option is correct by construction) selected/matched, none
  // missed. If `max_answers` caps selections/guesses below that count, an exact match is no longer
  // just hard, it's impossible — the question can only ever score 0, for every player, regardless
  // of what they answer. Worth a hard error rather than a silently unwinnable question, since
  // there's an easy, unambiguous fix either way (raise `max_answers`, or opt into partial credit).
  const correctCount = question.options.filter((o) => o.correct).length;
  if (
    question.settings.partial_credit !== true &&
    typeof maxAnswers === 'number' &&
    maxAnswers < correctCount
  ) {
    errors.push({
      line: firstLine,
      message: `"max_answers" (${maxAnswers}) is less than the number of correct options/accepted answers (${correctCount}), so an exact match is impossible — raise "max_answers" to at least ${correctCount}, or set "partial_credit=true" to allow scoring less than all of them.`
    });
  }

  return question;
}

/** Parses a single question's own source (no frontmatter) — the per-card "code" a question-first
 * editor operates on. A blank line outside `{ }` still means "next question" here, so pasted-in
 * content spanning more than one such block is flagged rather than silently merged or truncated. */
export function parseQuizScriptQuestion(source: string): {
  question: QuizScriptQuestion;
  errors: QuizScriptError[];
} {
  const errors: QuizScriptError[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  const blocks = splitQuestionBlocks(lines, 0);

  if (blocks.length > 1) {
    errors.push({
      line: blocks[1][0].num,
      message:
        'A question can only contain one blank-line-separated block; found extra content after a blank line.'
    });
  }

  const question = parseQuestionBlock(blocks[0] ?? [], errors);
  return { question, errors };
}

/** Parses just the `--- ... ---` frontmatter block (title/description/category/tags plus quiz-
 * wide settings) from a standalone source snippet — the unit the quiz metadata card's own code
 * mode operates on, independent of any question. Mirrors `parseQuizScriptQuestion`'s role for a
 * single question. */
export function parseQuizScriptFrontmatter(source: string): {
  frontmatter: QuizScriptFrontmatter;
  errors: QuizScriptError[];
} {
  const errors: QuizScriptError[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  // `parseFrontmatter` treats a missing opening "---" as "no frontmatter block" and silently
  // returns a blank one with no error — the right call for a whole document, where frontmatter is
  // optional and there's a rest-of-document to fall back to. Here there is no rest of document;
  // this whole source IS supposed to be the frontmatter, so a missing "---" is actually broken
  // input, not an absent-but-valid section — flag it, or a mistyped/deleted opening line would
  // silently commit as blank title/description/category/tags/settings.
  if (lines[0]?.trim() !== '---') {
    errors.push({ line: 1, message: 'Quiz metadata must start with "---".' });
  }
  const { frontmatter } = parseFrontmatter(lines, errors);
  return { frontmatter, errors };
}

/** Parses a whole `.qwiz` document (frontmatter + every question) for import — the counterpart to
 * `serializeQuizScript`. Returns each question as its own raw source slice (matching how the app
 * actually stores a question — see `QuizQuestion.code` in types.ts), not parsed
 * `QuizScriptQuestion` objects, plus every problem found (frontmatter and per-question) as flat,
 * human-readable messages rather than `QuizScriptError` line numbers — a pasted/uploaded file's
 * line numbers aren't shown anywhere in the import UI, so "Question 3: ..." is more useful here
 * than "Line 47: ...". */
export function parseQwizFile(source: string): {
  frontmatter: QuizScriptFrontmatter;
  questionCodes: string[];
  errors: string[];
} {
  const frontmatterErrors: QuizScriptError[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  if (lines[0]?.trim() !== '---') {
    frontmatterErrors.push({ line: 1, message: 'File must start with "---".' });
  }
  const { frontmatter, bodyStart } = parseFrontmatter(lines, frontmatterErrors);
  const questionCodes = splitQuestionBlocks(lines, bodyStart).map((block) =>
    block.map((l) => l.text).join('\n')
  );

  const errors = frontmatterErrors.map((e) => `Line ${e.line}: ${e.message}`);
  questionCodes.forEach((code, i) => {
    parseQuizScriptQuestion(code).errors.forEach((e) =>
      errors.push(`Question ${i + 1}: ${e.message}`)
    );
  });
  if (questionCodes.length === 0) errors.push('File has no questions.');

  return { frontmatter, questionCodes, errors };
}

/** Inverse of `coerceSetting` — re-quotes a string value that would otherwise change type
 * (to a boolean or number) the next time it's parsed. */
function formatSettingValue(value: string | number | boolean): string {
  if (typeof value !== 'string') return String(value);
  const looksTyped =
    value === 'true' || value === 'false' || (value !== '' && !Number.isNaN(Number(value)));
  return looksTyped ? `"${value}"` : value;
}

/** Inverse of `parseQuizScriptFrontmatter`, so the quiz metadata card's form fields can be
 * round-tripped through its code mode the same way `serializeQuizScriptQuestion` does for a
 * question. */
export function serializeQuizScriptFrontmatter(frontmatter: QuizScriptFrontmatter): string {
  const lines: string[] = ['---'];
  lines.push(`title: ${escapeFrontmatterValue(frontmatter.title)}`);
  lines.push(`description: ${escapeFrontmatterValue(frontmatter.description)}`);
  lines.push(`category: ${escapeFrontmatterValue(frontmatter.category)}`);
  lines.push(`tags: [${frontmatter.tags.join(', ')}]`);
  for (const [key, value] of Object.entries(frontmatter.settings)) {
    lines.push(`:${key}=${formatSettingValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/** Serializes a whole quiz — frontmatter plus every question's own already-serialized source —
 * into one `.qwiz` document: the format the "Download" button and file/paste import both use.
 * `questionCodes` are each question's canonical source text as-is (see `QuizQuestion.code` in
 * types.ts), not re-derived from parsed `QuizScriptQuestion` objects, since raw source is what
 * the app actually stores per question. */
export function serializeQuizScript(
  frontmatter: QuizScriptFrontmatter,
  questionCodes: string[]
): string {
  return [serializeQuizScriptFrontmatter(frontmatter), ...questionCodes].join('\n\n');
}

/** True when writing `text` back out raw (unescaped) would be read as something other than
 * plain text on the next parse — i.e. `escapeIfNeeded` below needs to protect it. A single
 * leading backslash is always enough to neutralize any of these, since `parseEscaped` takes
 * everything after it as literal, unparsed text. */
function needsEscape(text: string, context: 'line' | 'option'): boolean {
  if (text.startsWith('\\') || isQuoted(text)) return true;
  if (
    IMAGE_LINE.test(text) ||
    VIDEO_LINE.test(text) ||
    REVEAL_LINE.test(text) ||
    ANALYSIS_LINE.test(text) ||
    OPTION_POINTS.test(text)
  )
    return true;
  if (context === 'line')
    return (
      VARIANT_LINE.test(text) ||
      VARIANT_HEADER_LINE.test(text) ||
      SETTING_LINE.test(text) ||
      text === '{' ||
      text === '}'
    );
  return text.startsWith('=') || text.startsWith('~');
}

function escapeIfNeeded(text: string, context: 'line' | 'option'): string {
  return needsEscape(text, context) ? `\\${text}` : text;
}

/** `escape` guards the leading `=`/`~` that would otherwise re-read as an option marker — only the
 * first thing on the line can be mistaken for one, so it applies to an option's own content and
 * never to a `-> target`, where a leading `=` is just a character. Escaping there would break the
 * round trip outright: `-> \=France` parses back as the literal text `\=France`. */
function formatOptionContent(content: QuizScriptOptionContent, escape = true): string {
  if (content.kind === 'text') return escape ? escapeIfNeeded(content.text, 'option') : content.text;
  if (content.kind === 'image') return `![${content.alt}](${content.url})`;
  return `!<youtube>[${content.alt}](${content.url})`;
}

function formatOption(option: QuizScriptOption): string {
  const marker = option.correct ? '=' : '~';
  const points = option.points === undefined ? '' : ` %${option.points}%`;
  const content: QuizScriptOptionContent =
    option.content.kind === 'text' && option.prerevealed
      ? { kind: 'text', text: insertPrerevealMarkers(option.content.text, option.prerevealed) }
      : option.content;
  const target =
    option.target === undefined ? '' : ` -> ${formatOptionContent(option.target, false)}`;
  return `${marker}${formatOptionContent(content)}${target}${points}`;
}

function formatReveal(reveal: QuizScriptReveal): string {
  const points = reveal.points ? ` %${reveal.points}%` : '';
  return `!<reveal>[${reveal.label}](${reveal.content})${points}`;
}

function formatAnalysis(analysis: QuizScriptAnalysis): string {
  return `!<analysis>[${analysis.label}](${analysis.content})`;
}

/**
 * Inverse of `parseQuizScriptQuestion`, so a form-mode field edit can be written back into a
 * question's canonical `code`. Blank lines are stripped out of `text`: the parser can never
 * represent an embedded blank line there in the first place (a blank line outside `{ }` always
 * means "next question"), so leaving one in would silently fragment the question next parse.
 */
export function serializeQuizScriptQuestion(question: QuizScriptQuestion): string {
  const textLines = question.text.split('\n').filter((line) => line.trim() !== '');
  const escapedTextLines = textLines.map((l) => escapeIfNeeded(l, 'line'));
  const lines: string[] = [];

  if (question.variant === 'question') {
    lines.push(...escapedTextLines);
  } else if ((KNOWN_VARIANTS as string[]).includes(question.variant)) {
    // The header line's own text (textLines[0], unescaped) is never re-checked against any other
    // special-line pattern by the parser — VARIANT_HEADER_LINE already consumes the whole line
    // unconditionally — so it needs no escaping of its own.
    lines.push(`${question.variant}: ${textLines[0] ?? ''}`.trimEnd());
    lines.push(...escapedTextLines.slice(1));
  } else {
    lines.push(`variant : ${question.variant}`);
    lines.push(...escapedTextLines);
  }

  for (const media of question.media) {
    lines.push(
      media.kind === 'image'
        ? `![${media.alt}](${media.url})`
        : `!<youtube>[${media.alt}](${media.url})`
    );
  }

  for (const extra of question.extras) lines.push(formatReveal(extra));
  if (question.analysis) lines.push(formatAnalysis(question.analysis));

  lines.push('{');
  for (const option of question.options) lines.push(formatOption(option));
  lines.push('}');

  for (const [key, value] of Object.entries(question.settings)) {
    lines.push(`:${key}=${formatSettingValue(value)}`);
  }

  return lines.join('\n');
}
