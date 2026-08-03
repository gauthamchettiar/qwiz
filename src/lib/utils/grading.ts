import {
  optionContentKey,
  optionLabelText,
  optionTargetText,
  resolveQuestionSettings,
  type QuizScriptOption,
  type QuizScriptQuestion,
  type QuizScriptSettings
} from './quizScript';
import { shuffledArray } from './shuffle';

export interface QuestionResult {
  earned: number;
  max: number;
}

/** Exported so a player UI can read min_answers/max_answers/etc the same way grading itself reads
 * points_correct/points_wrong/points_to_win — one place deciding what counts as "a number was actually set". */
export function settingNumber(value: string | number | boolean | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** Exported so a player UI can read a boolean setting (e.g. `show_running_score`) the same way grading
 * itself reads `partial_credit`/`match_case`/etc. */
export function settingBoolean(value: string | number | boolean | undefined): boolean {
  return value === true;
}

/** Exported so a player UI can read a string-valued (enum) setting — e.g. `reveal_answers` /
 * `reveal_scores` — with its default already applied, the same way `settingNumber` covers numeric
 * ones. A valid enum setting is always stored as a lowercase string once parsed; `fallback` covers
 * both "not set" and any other, non-string value. */
export function settingString(
  value: string | number | boolean | undefined,
  fallback: string
): string {
  return typeof value === 'string' ? value : fallback;
}

/** An option's effective point value: its own `%N%` weight if given, else the question's
 * `:points_correct=`/`:points_wrong=` default for a correct/incorrect option respectively, else 1 for a
 * correct option (a right answer is worth *something* by default) or 0 for an incorrect one (no
 * penalty unless the author opts in) — the reconciliation `QuizScriptOption.points` docs in
 * quizScript.ts call out as a scoring concern left to whatever actually grades a run. */
export function effectivePoints(
  option: Pick<QuizScriptOption, 'correct' | 'points'>,
  settings: QuizScriptSettings
): number {
  if (option.points !== undefined) return option.points;
  if (option.correct) return settingNumber(settings.points_correct) ?? 1;
  return settingNumber(settings.points_wrong) ?? 0;
}

/** Reveal-hint scoring: sum of revealed extras' (usually negative) cost, and the max sums only
 * the positive-cost ones (a hint that can only cost points, never gain them, shouldn't inflate the
 * achievable max). Shared by every question kind's grade function — choice and typed alike. */
function gradeRevealExtras(
  extras: QuizScriptQuestion['extras'],
  revealed: ReadonlySet<number>
): QuestionResult {
  const earned = extras.reduce((sum, e, i) => sum + (revealed.has(i) ? e.points : 0), 0);
  const max = extras.reduce((sum, e) => sum + Math.max(e.points, 0), 0);
  return { earned, max };
}

/** The best achievable score when at most `cap` of `points` can ever be selected/matched at once
 * (`cap` undefined = no limit — e.g. no `max_answers` set): sort descending, take the top `cap`,
 * and sum only the positive ones among those. An optimal player never deliberately picks a
 * zero/negative-scoring one even if the cap leaves room, and — the actual bug this fixes — when
 * there are MORE positive-scoring options than the cap allows selecting, the achievable max is
 * the best `cap` of them, not all of them (you can only ever pick `cap`-many). Shared by choice's
 * partial-credit path and typed's multi-guess path, both of which sum several independently-
 * scored picks rather than requiring an exact-match set. */
function cappedPositiveSum(points: number[], cap: number | undefined): number {
  const limit = cap ?? points.length;
  return [...points]
    .sort((a, b) => b - a)
    .slice(0, limit)
    .reduce((sum, p) => sum + Math.max(p, 0), 0);
}

/** Grades one question given which option indices the player selected and which hint (extra)
 * indices they revealed — indices into `question.options`/`question.extras` in their ORIGINAL
 * (unshuffled) order, regardless of what order the player saw them in (see `PlayQuestion` below).
 * `partial_credit` (default false, i.e. exact-match-or-nothing) controls whether picking some but
 * not all correct options earns partial credit or scores the whole question 0.
 *
 * Only the `partial_credit` path caps its achievable max by `max_answers` (via
 * `cappedPositiveSum`) when there are more correct/positive-scoring options than the player could
 * ever select at once — e.g. 3 correct options worth 1 point each with `max_answers=2` tops out at
 * 2, not 3. The exact-match path deliberately does NOT: it's strictly binary (the full correct
 * set or nothing), so its max is always the full `correctSum` regardless of `max_answers` —
 * there's no achievable "partial subset" score to cap in the first place. (`max_answers` set below
 * the number of correct options on an exact-match question would make it genuinely unwinnable —
 * quizScript.ts's `parseQuestionBlock` rejects that combination at parse time rather than letting
 * it silently reach here, so this function never actually has to handle it.) */
export function gradeQuestion(
  question: QuizScriptQuestion,
  selected: ReadonlySet<number>,
  revealed: ReadonlySet<number>
): QuestionResult {
  const effective = question.options.map((o) => effectivePoints(o, question.settings));
  const partial = settingBoolean(question.settings.partial_credit);

  let optionsEarned: number;
  let optionsMax: number;
  if (partial) {
    optionsEarned = effective.reduce((sum, p, i) => sum + (selected.has(i) ? p : 0), 0);
    optionsMax = cappedPositiveSum(effective, settingNumber(question.settings.max_answers));
  } else {
    const isExact = question.options.every((o, i) => selected.has(i) === o.correct);
    const correctSum = question.options.reduce(
      (sum, o, i) => sum + (o.correct ? effective[i] : 0),
      0
    );
    optionsEarned = isExact ? correctSum : 0;
    optionsMax = correctSum;
  }

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: optionsMax + reveal.max };
}

/** The options-container class for a `pick_one`/`pick_many` question, driven by
 * `options_layout` — shared by QuestionView (author-side preview), QuestionPlayer (live
 * answering), and QuizPlayer (the run's Review screen), which all rendered this same three-way
 * branch independently before. "list" (or the setting being absent): one option per row.
 * "grid2x2": a fixed 2-column grid. "grid3x3": 2 columns on narrow screens, 3 on wider ones. */
export function choiceOptionsLayoutClass(question: QuizScriptQuestion): string {
  if (question.settings.options_layout === 'grid2x2') return 'grid grid-cols-2 gap-2';
  if (question.settings.options_layout === 'grid3x3') {
    return 'grid grid-cols-2 sm:grid-cols-3 gap-2';
  }
  return 'space-y-2';
}

// --- Typed-question matching and grading --------------------------------------------------
// A typed question's `options` are accepted answers (every one `correct: true` by construction —
// see quizScript.ts's `parseQuestionBlock`), matched against what the player actually typed
// instead of picked, so none of the Set-of-selected-indices logic above applies to it.

/** Always-on normalization for typed-answer comparison: trim, accent-fold (NFD decompose then
 * strip combining marks, so "café" reads as "cafe"), lowercase unless `match_case`, strip
 * punctuation (Unicode-aware — keeps letters/digits/whitespace only), collapse internal
 * whitespace runs, trim again. None of this is configurable except the casing step — same
 * category as whitespace-collapsing already being unconditional elsewhere in this format. */
// Combining diacritical marks (U+0300-U+036F) left behind by NFD-decomposing an accented letter
// into base-letter + mark — built via RegExp(string) rather than a `/.../ ` literal so the escape
// sequences stay as plain, unambiguous text rather than actual combining characters embedded in
// source.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

export function normalizeTypedAnswer(text: string, settings: QuizScriptSettings): string {
  let s = text.trim().normalize('NFD').replace(COMBINING_MARKS, '');
  if (!settingBoolean(settings.match_case)) s = s.toLowerCase();
  s = s.replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
  return s.trim();
}

/** Classic iterative single-row Levenshtein edit distance. No dependency; ~15 lines. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/** Whether `response` matches `answer` under this question's matching settings. Numeric
 * comparison is checked FIRST, against the merely-trimmed originals — `normalizeTypedAnswer`
 * strips punctuation (by design, so "co-operate" matches "cooperate"), which would otherwise
 * destroy the decimal point in "3.14" before `Number()` ever saw it, silently comparing the wrong
 * values instead of just failing to match. Only when numeric parsing doesn't apply does normalized
 * comparison (with fuzzy-tolerance, if set) take over. Precedence when both `number_tolerance`
 * and `typo_tolerance` happen to be set (the parser rejects this on any question it parses — see
 * quizScript.ts — but a hand-built question object bypasses that): numeric wins whenever both
 * sides actually parse as numbers, since edit-distance on numbers is fairly meaningless ("31.4" vs
 * "3.14" is 2 edits but a very different value). */
export function isTypedMatch(
  response: string,
  answer: string,
  settings: QuizScriptSettings
): boolean {
  const numericTolerance = settingNumber(settings.number_tolerance);
  if (numericTolerance !== undefined) {
    const rRaw = response.trim();
    const aRaw = answer.trim();
    const rn = Number(rRaw);
    const an = Number(aRaw);
    if (rRaw !== '' && aRaw !== '' && !Number.isNaN(rn) && !Number.isNaN(an)) {
      return Math.abs(rn - an) <= numericTolerance;
    }
    // Not numeric after all — fall through to normalized string comparison below.
  }

  const r = normalizeTypedAnswer(response, settings);
  const a = normalizeTypedAnswer(answer, settings);
  if (r === '' || a === '') return false;

  const fuzzyTolerance = settingNumber(settings.typo_tolerance);
  if (fuzzyTolerance !== undefined) {
    const allowed = Math.round((fuzzyTolerance / 100) * a.length);
    return levenshteinDistance(r, a) <= allowed;
  }

  return r === a;
}

function typedAnswerPool(options: QuizScriptOption[]): { index: number; text: string }[] {
  return options
    .map((o, index) => ({ index, content: o.content }))
    .filter(
      (entry): entry is { index: number; content: { kind: 'text'; text: string } } =>
        entry.content.kind === 'text'
    )
    .map(({ index, content }) => ({ index, text: content.text }));
}

/** Index of the first accepted-answer option `response` matches, or `null` — exported so a player
 * UI can show match/no-match feedback independent of point value (a deliberate `%0%`-weighted
 * correct match must still visibly read as "matched", not be indistinguishable from wrong by
 * checking `earned > 0`). */
export function typedSingleAnswerMatches(
  options: QuizScriptOption[],
  response: string,
  settings: QuizScriptSettings
): number | null {
  const pool = typedAnswerPool(options);
  const hit = pool.find(({ text }) => isTypedMatch(response, text, settings));
  return hit ? hit.index : null;
}

export type TypedGuessStatus = 'blank' | 'wrong' | 'redundant' | 'matched';

export interface TypedGuessResult {
  status: TypedGuessStatus;
  /** Only present when status is 'matched'. */
  optionIndex?: number;
}

/** Matches a submission-ordered list of guesses against the accepted-answer pool for a multi-guess
 * typed question. Each guess "claims" at most one option, and two guesses can never claim the same
 * option — a guess that only matches an already-claimed option is 'redundant' (no credit, but also
 * not penalized: punishing a re-guess of something already gotten right would be unfair). A blank
 * guess is ignored entirely (`'blank'`). Everything else that matches nothing is 'wrong'.
 *
 * Known limitation: if an author lists two options that are really synonyms of the *same*
 * underlying answer within a MULTI-GUESS question (e.g. "USA" and "United States" both meant to
 * represent one of several countries to name), a player who types both gets credited for both,
 * since claiming is tracked per option index, not per distinct concept. This is fine — expected,
 * even — in single-input questions (only one guess is ever graded there); authors should avoid
 * listing synonyms as separate options specifically within a multi-guess question. */
export function matchTypedGuesses(
  options: QuizScriptOption[],
  guesses: string[],
  settings: QuizScriptSettings
): { perGuess: TypedGuessResult[]; wrongCount: number } {
  const pool = typedAnswerPool(options);
  const perGuess: TypedGuessResult[] = [];
  let wrongCount = 0;

  const claimed = new Set<number>();
  for (const guess of guesses) {
    if (normalizeTypedAnswer(guess, settings) === '') {
      perGuess.push({ status: 'blank' });
      continue;
    }
    const hits = pool.filter(({ text }) => isTypedMatch(guess, text, settings));
    if (hits.length === 0) {
      perGuess.push({ status: 'wrong' });
      wrongCount++;
      continue;
    }
    const unclaimed = hits.find(({ index }) => !claimed.has(index));
    if (unclaimed) {
      claimed.add(unclaimed.index);
      perGuess.push({ status: 'matched', optionIndex: unclaimed.index });
    } else {
      perGuess.push({ status: 'redundant' });
    }
  }

  return { perGuess, wrongCount };
}

/** Grades a typed question. `response` is a single string for single-input mode, or an array of
 * guesses (in submission order) for multi-guess mode (`max_answers > 1` — see `PlayQuestion`/
 * `QuizPlayer.svelte`). Single mode's max is the *best* accepted answer's point value (any one
 * correct response already wins the blank, unlike multi-select's need-them-all sum) — there's no
 * concept of "partial" with only one guess, so `partial_credit` is never consulted there.
 *
 * Multi-guess mode branches on `partial_credit`, mirroring `gradeQuestion`'s own choice/exact
 * split exactly:
 * - `partial_credit` (default false): each guess is graded independently and summed — a wrong
 *   guess costs `:points_wrong=`'s default (via a synthetic incorrect option, same as choice's own
 *   `partial_credit` path lets a selected incorrect option's effective points count as negative
 *   `earned`), and the achievable max is the best `max_answers` accepted answers (via
 *   `cappedPositiveSum` — same fix as choice's `partial_credit` path, and for the same reason:
 *   "name N things" tops out at N, not at however many accepted answers happen to exist).
 * - Exact match (default): all-or-nothing — every accepted answer must be matched by some guess,
 *   with zero wrong guesses, or the question scores 0 regardless of how many were right; the max
 *   is the full sum of every accepted answer's points, uncapped by `max_answers` (same reasoning as
 *   choice's own exact-match path — see `gradeQuestion` — including that `max_answers` set below
 *   the number of accepted answers is rejected at parse time rather than reaching here). */
export function gradeTypedQuestion(
  question: QuizScriptQuestion,
  response: string | string[],
  revealed: ReadonlySet<number>
): QuestionResult {
  const settings = question.settings;
  let optionsEarned: number;
  let optionsMax: number;

  if (typeof response === 'string') {
    const matched = typedSingleAnswerMatches(question.options, response, settings);
    optionsMax = Math.max(0, ...question.options.map((o) => effectivePoints(o, settings)));
    optionsEarned = matched !== null ? effectivePoints(question.options[matched], settings) : 0;
  } else if (settingBoolean(settings.partial_credit)) {
    const { perGuess, wrongCount } = matchTypedGuesses(question.options, response, settings);
    const wrongGuessPenalty = effectivePoints({ correct: false, points: undefined }, settings);
    optionsEarned =
      perGuess.reduce(
        (sum, g) =>
          sum +
          (g.status === 'matched'
            ? effectivePoints(question.options[g.optionIndex!], settings)
            : 0),
        0
      ) +
      wrongCount * wrongGuessPenalty;
    optionsMax = cappedPositiveSum(
      question.options.map((o) => effectivePoints(o, settings)),
      settingNumber(settings.max_answers)
    );
  } else {
    const { perGuess, wrongCount } = matchTypedGuesses(question.options, response, settings);
    const matchedCount = new Set(
      perGuess.filter((g) => g.status === 'matched').map((g) => g.optionIndex)
    ).size;
    const isExact = wrongCount === 0 && matchedCount === question.options.length;
    const correctSum = question.options.reduce((sum, o) => sum + effectivePoints(o, settings), 0);
    optionsEarned = isExact ? correctSum : 0;
    optionsMax = correctSum;
  }

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: optionsMax + reveal.max };
}

/** Character-box *shape* for a typed question in `typed_input=boxes` — one group of boxes per
 * word of the first accepted answer's FULLY normalized text (not just whitespace-stripped),
 * deliberately matching what grading actually compares against: every visible box then
 * corresponds to something that matters, rather than showing a box for punctuation grading
 * silently ignores. A multi-word answer ("new york") renders as multiple box groups — `[3, 4]` —
 * rather than one run of boxes with no visual indication of where one word ends and the next
 * begins. Used for both single-answer and multi-guess (`max_answers > 1`) mode: in multi-guess
 * mode every banked guess reuses this same shape, since which accepted answer a given guess is
 * "for" isn't known in advance. */
export function typedBoxGroups(question: QuizScriptQuestion): number[] {
  const pool = typedAnswerPool(question.options);
  if (pool.length === 0) return [];
  const normalized = normalizeTypedAnswer(pool[0].text, question.settings);
  return normalized
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word.length);
}

/** Total character-box count across every group (see `typedBoxGroups`) — the flat count a box
 * row's backing state array is sized to, regardless of how those boxes are visually grouped. */
export function typedBoxCount(question: QuizScriptQuestion): number {
  return typedBoxGroups(question).reduce((sum, n) => sum + n, 0);
}

// --- guess_letters matching and grading --------------------------------------------------
// A guess_letters question's single accepted answer (its first `=` option, same "first
// accepted answer" convention typedBoxGroups uses) is guessed letter-by-letter via an on-screen
// bank rather than typed — see docs/qwiz-format.md's "Character input" section for the authored
// syntax (`[X]` pre-reveal brackets, letter_bank/letter_reveal/letters_shown_at_start settings).

/** A Unicode letter — the only kind of character this variant's letter bank deals with. Anything
 * else (spaces, punctuation, digits) is always shown, never guessable, and never counted toward
 * distinct-letter scoring, matching how a real Hangman board doesn't ask you to guess the spaces
 * between words. Exported so QuestionPlayer.svelte's box row can apply the same "is this
 * character part of the guessing game or always-visible" rule when rendering. */
export function isGuessableChar(c: string): boolean {
  return /\p{L}/u.test(c);
}

/** The answer text a guess_letters question's box row/bank are built from — its first `=`
 * option's text (same "first accepted answer" convention `typedBoxGroups` uses). Exported so
 * QuestionPlayer.svelte doesn't duplicate this "first option, text kind" access. */
export function characterInputAnswerText(question: QuizScriptQuestion): string {
  const answer = question.options[0];
  return answer?.content.kind === 'text' ? answer.content.text : '';
}

function normalizeLetter(letter: string): string {
  return letter.toLowerCase();
}

function distinctGuessableLetters(text: string): Set<string> {
  const letters = new Set<string>();
  for (const c of text) {
    if (isGuessableChar(c)) letters.add(normalizeLetter(c));
  }
  return letters;
}

/** `letters_shown_at_start`'s random extra pre-reveal positions, resolved once — exported so
 * `QuestionPlayer.svelte` can call it itself at mount time and seed `QuestionDraft.extraPrerevealed`
 * with a properly-sized, stable-for-this-session result, the same way it already calls
 * `typedBoxCount`/builds `boxChars` itself rather than `blankDraft()` doing it (`blankDraft()`
 * stays entirely question-agnostic, so it can't resolve this on its own). Deliberately excludes
 * explicit `[X]` bracket positions from the pool (those are always revealed regardless) and
 * non-letter characters (never guessable in the first place — see `isGuessableChar`). */
export function resolveExtraPrereveal(question: QuizScriptQuestion): Set<number> {
  const text = characterInputAnswerText(question);
  const bracketPositions = new Set(question.options[0]?.prerevealed ?? []);
  const prerevealCount = settingNumber(question.settings.letters_shown_at_start) ?? 0;
  const eligible = Array.from({ length: text.length }, (_, i) => i).filter(
    (i) => !bracketPositions.has(i) && isGuessableChar(text[i])
  );
  return new Set(shuffledArray(eligible).slice(0, prerevealCount));
}

/** Every position in the answer text that's pre-revealed from the start — explicit `[X]` brackets
 * (`option.prerevealed`) plus `draft.extraPrerevealed`'s already-resolved `letters_shown_at_start`
 * additions (see `resolveExtraPrereveal`). Exported so the bank/box UI can render "shown for free"
 * styling without duplicating this union. */
export function characterInputPrerevealedPositions(
  question: QuizScriptQuestion,
  extraPrerevealed: ReadonlySet<number>
): ReadonlySet<number> {
  return new Set([...(question.options[0]?.prerevealed ?? []), ...extraPrerevealed]);
}

/** Whether `letter` appears anywhere among the answer's guessable letters — the check a bank-
 * guess handler uses to decide whether to record 'correct' or 'wrong' in
 * `QuestionDraft.guessedLetters` for it. */
export function characterInputLetterInAnswer(
  question: QuizScriptQuestion,
  letter: string
): boolean {
  return distinctGuessableLetters(characterInputAnswerText(question)).has(normalizeLetter(letter));
}

/** Normalizes a single guessed letter (or bank-button label) into the exact casing
 * `QuestionDraft.guessedLetters` keys are stored/looked-up under elsewhere in this module —
 * exported so `QuestionPlayer.svelte`'s bank-click handler stores under the same key
 * `gradeCharacterInputQuestion` later reads, rather than duplicating this one-line rule inline. */
export function characterInputNormalizeGuess(letter: string): string {
  return normalizeLetter(letter);
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

/** The letters offered in the on-screen bank, per the `letter_bank` setting — `alphabet` (the
 * default): the full a-z. `auto`: every distinct letter actually in the answer, plus a handful (up
 * to 6) of random decoys that aren't, so a guess still carries real risk — an all-real-letters
 * bank would make every guess a free win. `fixed`: exactly the letters in `letter_bank_chars`. */
export function characterInputLetterBank(question: QuizScriptQuestion): string[] {
  const mode = settingString(question.settings.letter_bank, 'alphabet');
  const answerLetters = distinctGuessableLetters(characterInputAnswerText(question));

  if (mode === 'fixed') {
    const raw =
      typeof question.settings.letter_bank_chars === 'string'
        ? question.settings.letter_bank_chars
        : '';
    const bank = new Set<string>();
    for (const c of raw) if (isGuessableChar(c)) bank.add(normalizeLetter(c));
    return [...bank].sort();
  }

  if (mode === 'auto') {
    const decoyPool = ALPHABET.filter((l) => !answerLetters.has(l));
    const decoys = shuffledArray(decoyPool).slice(0, Math.min(6, decoyPool.length));
    return [...answerLetters, ...decoys].sort();
  }

  return ALPHABET;
}

/** Every position in the answer text occupied by `letter` (already-normalized casing) — the pool
 * `characterInputRevealPositionsAfterGuess` picks from. */
function letterOccurrences(text: string, letter: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (isGuessableChar(text[i]) && normalizeLetter(text[i]) === letter) {
      positions.push(i);
    }
  }
  return positions;
}

/** Updates `revealedPositions` after a CORRECT guess of `letter`, per the question's
 * `letter_reveal`: `all` reveals every occurrence of `letter` at once (classic Hangman);
 * `sequence` reveals just the next (lowest-index) not-yet-revealed occurrence; `random` reveals one
 * random not-yet-revealed occurrence. A no-op if every occurrence is already revealed (e.g. a stray
 * re-click after the bank button should already be disabled). Only ever called for a letter
 * already confirmed correct — never call this for a wrong guess, which reveals nothing. */
export function characterInputRevealPositionsAfterGuess(
  question: QuizScriptQuestion,
  revealedPositions: ReadonlySet<number>,
  letter: string
): Set<number> {
  const text = characterInputAnswerText(question);
  const occurrences = letterOccurrences(text, letter);
  const remaining = occurrences.filter((i) => !revealedPositions.has(i));
  if (remaining.length === 0) return new Set(revealedPositions);

  const mode = settingString(question.settings.letter_reveal, 'all');
  const toReveal =
    mode === 'all' ? remaining : mode === 'random' ? [shuffledArray(remaining)[0]] : [remaining[0]];
  return new Set([...revealedPositions, ...toReveal]);
}

/** Whether every occurrence of `letter` in the answer is currently revealed — what a bank button
 * checks (alongside a 'wrong' guess) to decide whether it should disable itself. Always true
 * immediately after a correct guess under `letter_reveal=all`; only true once enough repeat clicks
 * have happened under `sequence`/`random` for a letter that repeats in the answer. `false` for a
 * letter that isn't in the answer at all — `.every()` on its empty occurrence list would
 * otherwise be vacuously `true`, which would wrongly pre-disable every never-guessed, not-in-the-
 * word bank letter from the very first render (there's nothing to "fully reveal" for a letter
 * that was never there — that's what a genuine wrong guess is for). */
export function characterInputLetterFullyRevealed(
  question: QuizScriptQuestion,
  revealedPositions: ReadonlySet<number>,
  letter: string
): boolean {
  const text = characterInputAnswerText(question);
  const occurrences = letterOccurrences(text, letter);
  return occurrences.length > 0 && occurrences.every((i) => revealedPositions.has(i));
}

/** Grades a guess_letters question. Scoring is per DISTINCT guessable letter, not per
 * occurrence — guessing "e" that appears three times in the answer is one scoring event, same
 * whether `letter_reveal` reveals all three occurrences at once or trickles them out one guess at a
 * time (letter_reveal is a pure display concern, irrelevant to grading here). A pre-revealed letter
 * (explicit bracket or `letters_shown_at_start`, via `draft.extraPrerevealed`) counts toward neither
 * `earned` nor `max` — it was free, so it shouldn't inflate either side; `max` only counts the
 * letters actually left to guess. */
export function gradeCharacterInputQuestion(
  question: QuizScriptQuestion,
  draft: QuestionDraft
): QuestionResult {
  const text = characterInputAnswerText(question);
  const pointsCorrect = settingNumber(question.settings.points_correct) ?? 1;
  const pointsWrong = settingNumber(question.settings.points_wrong) ?? 0;

  const prerevealedLetters = new Set<string>();
  for (const i of characterInputPrerevealedPositions(question, draft.extraPrerevealed)) {
    if (isGuessableChar(text[i])) prerevealedLetters.add(normalizeLetter(text[i]));
  }

  const guessable = [...distinctGuessableLetters(text)].filter(
    (letter) => !prerevealedLetters.has(letter)
  );
  const correctGuessedCount = guessable.filter(
    (letter) => draft.guessedLetters.get(letter) === 'correct'
  ).length;
  const wrongGuessCount = [...draft.guessedLetters.values()].filter((v) => v === 'wrong').length;

  const reveal = gradeRevealExtras(question.extras, draft.revealed);
  return {
    earned: pointsCorrect * correctGuessedCount + pointsWrong * wrongGuessCount + reveal.earned,
    max: pointsCorrect * guessable.length + reveal.max
  };
}

// --- order matching and grading ------------------------------------------------------------
// An order question's options are forced `correct: true` at parse time (see quizScript.ts) — there
// is no right/wrong ITEM, only a right/wrong POSITION: the authored `{ }` order IS the answer key.

/** Grades an `order_items` question. `placement[i]` is the original option index the player put at
 * slot i (`null` while that slot is still empty); slot i is correct iff `placement[i] === i` — the
 * canonical, authored order. Mirrors `gradeQuestion`'s own exact-match/partial-credit split:
 * without `partial_credit`, every slot must be correct or the question scores 0; with it, each
 * correctly-placed slot scores independently. Either way `max` is the same full sum — unlike
 * choice's own `partial_credit` path, there's no `max_answers`-style cap to apply here, since every
 * option has exactly one slot to land in regardless of mode. */
export function gradeOrderQuestion(
  question: QuizScriptQuestion,
  placement: readonly (number | null)[],
  revealed: ReadonlySet<number>
): QuestionResult {
  const effective = question.options.map((o) => effectivePoints(o, question.settings));
  const correctSum = effective.reduce((sum, p) => sum + p, 0);
  const partial = settingBoolean(question.settings.partial_credit);
  const correctSlots = question.options.map((_, i) => placement[i] === i);
  const isExact = correctSlots.every(Boolean);

  const optionsEarned = partial
    ? effective.reduce((sum, p, i) => sum + (correctSlots[i] ? p : 0), 0)
    : isExact
      ? correctSum
      : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: correctSum + reveal.max };
}

// --- match/group_items matching and grading ---------------------------------------------------
// Both share the same `item -> target` option shape (see quizScript.ts's OPTION_TARGET) — every
// option is forced `correct: true` at parse time, same invariant as order above.

/** Grades a `match_pairs` question. `pairs` maps a left-side original option index to the right-side
 * original option index the player placed it against — since every option's OWN `.target` is that
 * option's one, unique right-column entry (see quizScript.ts), a pair is correct iff
 * `pairs.get(i) === i` (the player matched option i's item back to option i's own target).
 * Unpaired items simply aren't in the map yet. Mirrors `gradeOrderQuestion`'s exact-match/
 * partial-credit split exactly. */
export function gradeMatchQuestion(
  question: QuizScriptQuestion,
  pairs: ReadonlyMap<number, number>,
  revealed: ReadonlySet<number>
): QuestionResult {
  const effective = question.options.map((o) => effectivePoints(o, question.settings));
  const correctSum = effective.reduce((sum, p) => sum + p, 0);
  const partial = settingBoolean(question.settings.partial_credit);
  const correctPairs = question.options.map((_, i) => pairs.get(i) === i);
  const isExact = correctPairs.every(Boolean) && pairs.size === question.options.length;

  const optionsEarned = partial
    ? effective.reduce((sum, p, i) => sum + (correctPairs[i] ? p : 0), 0)
    : isExact
      ? correctSum
      : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: correctSum + reveal.max };
}

/** Grades a `group_items` question. `assignments` maps an original option index to the bucket
 * index (into `categoriseBuckets(question)`) the player put it in — an assignment is correct iff
 * that bucket's label equals the option's own authored target (always text for this variant, so
 * `optionTargetText` is exact here rather than a fallback). Unlike `match_pairs`, several options
 * can correctly share the same bucket, so there's no per-option "this bucket is taken" constraint
 * the way `match_pairs`'s 1-to-1 pairing has. Mirrors `gradeOrderQuestion`/`gradeMatchQuestion`'s own
 * exact-match/partial-credit split. */
export function gradeCategoriseQuestion(
  question: QuizScriptQuestion,
  assignments: ReadonlyMap<number, number>,
  revealed: ReadonlySet<number>
): QuestionResult {
  const buckets = categoriseBuckets(question);
  const effective = question.options.map((o) => effectivePoints(o, question.settings));
  const correctSum = effective.reduce((sum, p) => sum + p, 0);
  const partial = settingBoolean(question.settings.partial_credit);
  const correctAssignments = question.options.map((option, i) => {
    const bucketIndex = assignments.get(i);
    return bucketIndex !== undefined && buckets[bucketIndex] === optionTargetText(option);
  });
  const isExact = correctAssignments.every(Boolean) && assignments.size === question.options.length;

  const optionsEarned = partial
    ? effective.reduce((sum, p, i) => sum + (correctAssignments[i] ? p : 0), 0)
    : isExact
      ? correctSum
      : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: correctSum + reveal.max };
}

// --- answer_mode=type: typing the answer instead of using a board ---------------------------
// `order_items`, `match_pairs`, `group_items` and `fill_blanks` all place things rather than select them, and
// all four can instead be answered by typing (`:answer_mode=type`). What gets typed differs per
// variant, but everything after that — normalization, tolerance, the partial/exact split — is
// identical, so it lives here once rather than in four grade functions.

/** Whether this question is answered by typing rather than through its board. Only the four
 * placement variants offer the choice (see `SETTING_RULES.answer_mode.appliesTo`); anything else is
 * always false, so callers can ask unconditionally. */
export function isTypedAnswerMode(question: QuizScriptQuestion): boolean {
  return question.settings.answer_mode === 'type';
}

/** The expected text for each typed answer slot, in slot order:
 * - `fill_blanks` — each blank's own answer word, left to right.
 * - `order_items` — the item belonging at that position, so slot i expects option i (the authored
 *   sequence IS the answer key).
 * - `match_pairs`/`group_items` — each item's own target: the thing it pairs with, or the bucket it
 *   belongs in.
 *
 * All four now accept picture content where a slot's answer lives, and a picture is typed as its
 * alt text — `optionLabelText`/`optionTargetText`'s existing rule, which is why they're used here
 * rather than reading `.content.text` directly. A picture with no alt yields `''` and can't be
 * matched by anything, the same dead end an option the author left blank already was; it's worth
 * knowing that `answer_mode=type` is the one mode where alt text is load-bearing rather than
 * merely good practice.
 *
 * Exported so a board can show the right answer next to a slot the player got wrong without
 * re-deriving which option a slot corresponds to. */
export function typedSlotExpectations(question: QuizScriptQuestion): string[] {
  if (question.variant === 'fill_blanks') {
    return fillInBlanksAnswerOptions(question).map(optionLabelText);
  }
  if (question.variant === 'order_items') {
    return question.options.map(optionLabelText);
  }
  return question.options.map(optionTargetText);
}

/** How many typed slots this question has — what a draft's `blankAnswers` array is sized to. */
export function typedSlotCount(question: QuizScriptQuestion): number {
  return typedSlotExpectations(question).length;
}

/** Per-slot correctness for a typed answer, using the same matching a `type_answer` question gets
 * (`match_case`/`number_tolerance`/`typo_tolerance` all apply). An empty slot is never correct,
 * even against an empty expectation — leaving it blank isn't answering it. */
export function typedSlotCorrectness(
  question: QuizScriptQuestion,
  answers: readonly string[]
): boolean[] {
  return typedSlotExpectations(question).map((expected, i) => {
    const response = answers[i] ?? '';
    if (response.trim() === '') return false;
    return isTypedMatch(response, expected, question.settings);
  });
}

/** Grades any of the four placement variants when it's answered by typing. Scoring weights come
 * from the options the slots correspond to — the correct (`=`) options for `fill_blanks`, since
 * its `~` distractors have no blank of their own, and every option for the other three, where each
 * option owns exactly one slot. Mirrors the same `partial_credit` split every other grade function
 * uses. */
export function gradeTypedSlotsQuestion(
  question: QuizScriptQuestion,
  answers: readonly string[],
  revealed: ReadonlySet<number>
): QuestionResult {
  const scoredOptions =
    question.variant === 'fill_blanks' ? fillInBlanksAnswerOptions(question) : question.options;
  const effective = scoredOptions.map((o) => effectivePoints(o, question.settings));
  const correctSum = effective.reduce((sum, p) => sum + p, 0);
  const correct = typedSlotCorrectness(question, answers);
  const isExact = correct.every(Boolean);

  const optionsEarned = settingBoolean(question.settings.partial_credit)
    ? effective.reduce((sum, p, i) => sum + (correct[i] ? p : 0), 0)
    : isExact
      ? correctSum
      : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: correctSum + reveal.max };
}

// --- fill_blanks matching and grading -----------------------------------------------------
// A fill_blanks question's `___` tokens in `text` are its blanks, filled left-to-right by this
// question's correct ("=") options in order — its `~` options are distractor bank words with no
// blank of their own (see quizScript.ts's own validation: blank count must equal correct-option
// count). Unlike order/match/group_items, the `=`/`~` marker stays meaningful here.

/** The blank-answer options, in blank order (blank 0 first) — exported so the play/author UI can
 * read the same "which options are actual blank answers, not distractors" rule grading uses,
 * without re-deriving `.filter((o) => o.correct)` itself. */
export function fillInBlanksAnswerOptions(question: QuizScriptQuestion): QuizScriptOption[] {
  return question.options.filter((o) => o.correct);
}

/** Number of `___` blanks in `question.text` — exported so the UI can size its blank-answer state
 * without duplicating the regex quizScript.ts's own parse-time validation already uses. */
export function fillInBlanksCount(question: QuizScriptQuestion): number {
  return (question.text.match(/___/g) ?? []).length;
}

/** Grades a `fill_blanks` question.
 *
 * Two modes, two response shapes. `answer_mode=type`: `answers[i]` is what the player typed into
 * blank i, matched via `isTypedMatch` with the same normalization/tolerance settings a
 * `type_answer` question uses. `answer_mode=pick` (the default): `picks[i]` is the ORIGINAL option
 * index of the bank word they put in blank i, `null` while it's empty.
 *
 * Pick mode records an index rather than the word's text because a bank word can now be a picture,
 * which has no text to record — and compares by `optionContentKey`, not by index, so that two
 * options a player genuinely cannot tell apart (an answer and a distractor with the same word)
 * still both count, exactly as they did when this compared text directly. There's no typo or
 * casing for the tolerance settings to forgive either way: the word was chosen off a button.
 *
 * Mirrors `gradeOrderQuestion`/`gradeMatchQuestion`/`gradeCategoriseQuestion`'s own exact-match/
 * partial-credit split. */
export function gradeFillInBlanksQuestion(
  question: QuizScriptQuestion,
  answers: readonly string[],
  picks: readonly (number | null)[],
  revealed: ReadonlySet<number>
): QuestionResult {
  if (isTypedAnswerMode(question)) return gradeTypedSlotsQuestion(question, answers, revealed);

  const answerOptions = fillInBlanksAnswerOptions(question);
  const effective = answerOptions.map((o) => effectivePoints(o, question.settings));
  const correctSum = effective.reduce((sum, p) => sum + p, 0);
  const partial = settingBoolean(question.settings.partial_credit);

  const correctBlanks = answerOptions.map((option, i) => {
    const picked = picks[i];
    if (picked === null || picked === undefined) return false;
    const placed = question.options[picked];
    if (!placed) return false;
    return optionContentKey(placed.content) === optionContentKey(option.content);
  });
  const isExact = correctBlanks.every(Boolean);

  const optionsEarned = partial
    ? effective.reduce((sum, p, i) => sum + (correctBlanks[i] ? p : 0), 0)
    : isExact
      ? correctSum
      : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: optionsEarned + reveal.earned, max: correctSum + reveal.max };
}

// --- Answering a question: the shared draft/grade contract between QuestionPlayer.svelte (the
// live answering widget, reused both standalone in the editor and embedded in a real run) and
// QuizPlayer.svelte (which owns the run — sequencing, locking, revealing) ----------------------

/** Everything needed to reconstruct a player's in-progress or already-submitted answer to one
 * question, choice or typed alike — the shape both `QuestionPlayer.svelte`'s live widgets and a
 * run's per-question persistence (see `QuizPlayer.svelte`'s "reveal at the end" mode, where
 * answers must survive navigating away and back before anything is graded) read and write. */
export interface QuestionDraft {
  selected: Set<number>;
  revealed: Set<number>;
  typedSingleAnswer: string;
  boxChars: string[];
  typedGuesses: string[];
  typedGuessDraft: string;
  /** guess_letters only: which bank letters have been guessed so far, and whether each was
   * 'correct' (appears in the answer) or 'wrong'. */
  guessedLetters: Map<string, 'correct' | 'wrong'>;
  /** guess_letters only: `letters_shown_at_start`'s randomly-chosen extra pre-reveal positions —
   * blank here (see `blankDraft`, which stays entirely question-agnostic); `QuestionPlayer.svelte`
   * resolves the real value itself via `resolveExtraPrereveal(question)` at mount, the same way it
   * already resolves `boxChars`' sizing via `runBoxChars()` rather than `blankDraft()` doing it. */
  extraPrerevealed: Set<number>;
  /** guess_letters only: every answer-text position currently visible — starts out equal to
   * the pre-revealed set (bracket + extraPrerevealed) and grows as correct guesses land, per
   * `characterInputRevealPositionsAfterGuess`'s `letter_reveal` handling. Separate from
   * `guessedLetters` because they answer different questions: guessedLetters is "was this letter
   * ever correctly guessed" (for scoring, and for locking a wrong letter's bank button forever);
   * revealedPositions is "what's currently visible" (for display, and — under
   * `letter_reveal=sequence`/`random` — for deciding whether a correct letter's bank button should
   * still be clickable because not all of its occurrences are revealed yet). */
  revealedPositions: Set<number>;
  /** order only: one slot per option, holding the ORIGINAL option index placed there (`null` while
   * empty) — index into the array IS the target position, so a fully-placed draft with `[2, 0, 1]`
   * means "original option 2 goes first, option 0 second, option 1 third." Grading (see
   * `gradeOrderQuestion`) compares each slot's placed index against its own slot position. */
  orderPlacement: (number | null)[];
  /** order/match/group_items/fill_blanks only: the tap-to-select-then-place interaction's
   * "currently picked, awaiting a target" item — an original option index (order/match/group_items)
   * or bank-word slot index (fill_blanks), `null` when nothing is picked up. Persisted here
   * (rather than transient component state) for the same reason `typedGuessDraft` is: an
   * in-progress pick must survive navigating away and back before the question is graded. */
  picked: number | null;
  /** match only: this run's chosen pairing, left option index -> right option index (whose own
   * `.target` is the right-column label the player placed it against) — `undefined` while unpaired. */
  matchPairs: Map<number, number>;
  /** group_items only: this run's chosen bucket per option, option index -> bucket index into
   * `categoriseBuckets(question)`'s derived distinct-target array — absent while unassigned. */
  categoriseAssignments: Map<number, number>;
  /** One entry per typed answer slot (`answer_mode=type`, any of the four placement variants —
   * see `typedSlotCount`), in slot order: the text the player typed there, `''` while empty. Not
   * used at all in `answer_mode=pick`, which records `blankPicks` instead. */
  blankAnswers: string[];
  /** fill_blanks in `answer_mode=pick` only: one entry per `___` blank in `question.text`, in
   * left-to-right order — the ORIGINAL option index of the bank word placed there, `null` while
   * empty. An index rather than the word's own text, because a bank word can be a picture; it
   * also makes "which bank buttons are used up" exact for words that share the same text, which
   * matching back by text could only ever approximate. */
  blankPicks: (number | null)[];
}

export function blankDraft(): QuestionDraft {
  return {
    selected: new Set(),
    revealed: new Set(),
    typedSingleAnswer: '',
    boxChars: [],
    typedGuesses: [],
    typedGuessDraft: '',
    guessedLetters: new Map(),
    extraPrerevealed: new Set(),
    revealedPositions: new Set(),
    orderPlacement: [],
    picked: null,
    matchPairs: new Map(),
    categoriseAssignments: new Map(),
    blankAnswers: [],
    blankPicks: []
  };
}

/** Reassembles a flat `boxChars` array back into the answer string grading actually compares
 * against — words joined by a single space at each group boundary (see `typedBoxGroups`), since
 * the boxes themselves carry no space character of their own; without this, a two-word answer
 * typed correctly into its two box groups would still fail to match its space-containing accepted
 * answer. */
export function boxAnswer(chars: string[], groups: number[]): string {
  const words: string[] = [];
  let offset = 0;
  for (const len of groups) {
    words.push(chars.slice(offset, offset + len).join(''));
    offset += len;
  }
  return words.join(' ');
}

function typedResponseFromDraft(
  question: QuizScriptQuestion,
  draft: QuestionDraft
): string | string[] {
  const maxAnswers = settingNumber(question.settings.max_answers);
  if (maxAnswers !== undefined && maxAnswers > 1) return draft.typedGuesses;
  if (question.settings.typed_input === 'boxes')
    return boxAnswer(draft.boxChars, typedBoxGroups(question));
  return draft.typedSingleAnswer;
}

/** Whether `draft` has enough of an answer to submit — `min_answers`, plus mode-specific
 * completeness (every box filled, at least one character typed) — shared so a live Submit
 * button's own gating and any embedding parent's can never disagree about what counts as ready.
 * guess_letters has no `min_answers` (excluded from its settings — see quizScript.ts's
 * SETTING_RULES) and can be submitted at any point, guessed-so-far included, same as giving up
 * partway through a real Hangman round. */
/** Whether the player has put NOTHING into `draft` — the state a skipped question is submitted
 * in. Deliberately ignores `revealed`/`revealedPositions`: revealing a hint costs points but isn't
 * answering, so a question whose only interaction was opening a hint still reads as skipped.
 *
 * Kept separate from `!isDraftComplete` because the two are not opposites — a half-filled board is
 * neither complete nor empty, and the reveal screen needs to tell "answered badly" apart from
 * "didn't answer". */
export function isDraftEmpty(question: QuizScriptQuestion, draft: QuestionDraft): boolean {
  if (question.variant === 'guess_letters') return draft.guessedLetters.size === 0;
  if (question.variant === 'type_pattern') return draft.typedSingleAnswer.trim() === '';
  if (isTypedAnswerMode(question)) return draft.blankAnswers.every((a) => a.trim() === '');
  if (question.variant === 'order_items') return draft.orderPlacement.every((p) => p === null);
  if (question.variant === 'match_pairs') return draft.matchPairs.size === 0;
  if (question.variant === 'group_items') return draft.categoriseAssignments.size === 0;
  if (question.variant === 'fill_blanks') return draft.blankPicks.every((p) => p === null);

  if (question.variant !== 'type_answer') return draft.selected.size === 0;
  const maxAnswers = settingNumber(question.settings.max_answers);
  if (maxAnswers !== undefined && maxAnswers > 1) return draft.typedGuesses.length === 0;
  if (question.settings.typed_input === 'boxes') return draft.boxChars.every((c) => c === '');
  return draft.typedSingleAnswer.trim() === '';
}

/** Whether the Submit button should be live. Every variant is skippable by DEFAULT — submitting an
 * empty or half-finished draft is allowed, and grades as whatever it's worth (usually zero).
 * `require_answer=true` is how an author opts back into the old behaviour of holding Submit shut
 * until the answer is complete.
 *
 * Skipping was always possible in two corners of the app — a `per_question` timer running out
 * (`QuizPlayer.commitCurrentAnswer`) and `reveal_answers=at_end`, whose single final Submit grades
 * every draft as-is — so the grading side already handled blank drafts for all nine variants. This
 * only removes the gate in the third case, the per-question Submit button. */
export function canSubmitDraft(question: QuizScriptQuestion, draft: QuestionDraft): boolean {
  if (!settingBoolean(question.settings.require_answer)) return true;
  // Complete AND non-empty, because "complete" alone doesn't mean "answered" for every variant:
  // a choice question without `min_answers` is complete at zero selections (`0 >= 0`), and
  // guess_letters is complete by definition. Requiring an answer on either of those would
  // otherwise have gated nothing at all.
  return isDraftComplete(question, draft) && !isDraftEmpty(question, draft);
}

export function isDraftComplete(question: QuizScriptQuestion, draft: QuestionDraft): boolean {
  if (question.variant === 'guess_letters') return true;
  // Always a single free-text field, so "answered" is just "typed something" — the same bar the
  // single-input branch of type_answer uses at the end of this function.
  if (question.variant === 'type_pattern') return draft.typedSingleAnswer.trim().length > 0;
  if (isTypedAnswerMode(question)) {
    const slots = typedSlotCount(question);
    return draft.blankAnswers.length === slots && draft.blankAnswers.every((a) => a.trim() !== '');
  }
  if (question.variant === 'order_items') {
    return (
      draft.orderPlacement.length === question.options.length &&
      draft.orderPlacement.every((p) => p !== null)
    );
  }
  if (question.variant === 'match_pairs') return draft.matchPairs.size === question.options.length;
  if (question.variant === 'group_items') {
    return draft.categoriseAssignments.size === question.options.length;
  }
  if (question.variant === 'fill_blanks') {
    const blankCount = fillInBlanksAnswerOptions(question).length;
    return draft.blankPicks.length === blankCount && draft.blankPicks.every((p) => p !== null);
  }

  const minAnswers = settingNumber(question.settings.min_answers) ?? 0;
  if (question.variant !== 'type_answer') return draft.selected.size >= minAnswers;
  const maxAnswers = settingNumber(question.settings.max_answers);
  if (maxAnswers !== undefined && maxAnswers > 1) return draft.typedGuesses.length >= minAnswers;
  if (question.settings.typed_input === 'boxes')
    return draft.boxChars.length > 0 && draft.boxChars.every((c) => c !== '');
  return draft.typedSingleAnswer.trim().length > 0;
}

// --- type_pattern: regex-graded typed answers ------------------------------------------------
// The author writes regular expressions instead of literal accepted answers, so one option can
// stand for a whole family of responses ("2[0-9]{3}" for any 4-digit year). Its `=`/`~` markers
// both matter, unlike `type_answer`'s: `=` patterns say what's right, `~` patterns let an author
// call out a specific wrong answer — a classic misconception, say — and attach its own `%N%`
// penalty to it.

/** Whether `response` matches `pattern`, under this question's settings.
 *
 * Two deliberate decisions, both documented in qwiz-format.md because an author writing a pattern
 * has to know them:
 *
 * - **Implicitly anchored.** The pattern is wrapped in `^(?:...)$`, so `cat` matches "cat" and not
 *   "concatenate". An unanchored default is the classic way a quiz written this way quietly marks
 *   wrong answers correct, and `.*` on either end is easy to add back when a substring really is
 *   what's wanted. The non-capturing group keeps alternation intact — a bare `^a|b$` would
 *   otherwise parse as `(^a)|(b$)`.
 * - **Raw response, only trimmed.** `normalizeTypedAnswer`'s accent-folding and punctuation
 *   stripping would make a pattern like `\\d+\\.\\d+` unmatchable by removing the very characters
 *   it's written to match. Case is the one normalization that still applies, via `match_case`.
 *
 * An uncompilable pattern is rejected at parse time (`parseQuestionBlock`), so by here it only
 * happens for a hand-edited quiz that skipped the parser — treated as "doesn't match" rather than
 * thrown, since a player mid-run can't act on an exception. */
export function patternMatches(
  pattern: string,
  response: string,
  settings: QuizScriptSettings
): boolean {
  try {
    const flags = settingBoolean(settings.match_case) ? 'u' : 'iu';
    return new RegExp(`^(?:${pattern})$`, flags).test(response.trim());
  } catch {
    return false;
  }
}

/** The option index whose pattern `response` matches, or `null` for a response that matches none.
 *
 * A matching `~` pattern wins over a matching `=` one. An author writes a `~` pattern precisely
 * because it overlaps something a broad `=` pattern would otherwise sweep up — `=.+` plus
 * `~[Pp]aris` means "anything but Paris" — so resolving the other way round would make every `~`
 * pattern dead the moment a general `=` pattern also matched. */
export function matchedPatternIndex(question: QuizScriptQuestion, response: string): number | null {
  const patterns = question.options.map((option, index) => ({ option, index }));
  const text = (option: QuizScriptOption) =>
    option.content.kind === 'text' ? option.content.text : '';

  const wrong = patterns.find(
    ({ option }) => !option.correct && patternMatches(text(option), response, question.settings)
  );
  if (wrong) return wrong.index;

  const right = patterns.find(
    ({ option }) => option.correct && patternMatches(text(option), response, question.settings)
  );
  return right ? right.index : null;
}

/** Scores one type_pattern response: the matched pattern's own points (its `%N%` if it has one,
 * otherwise `points_correct`/`points_wrong`), or nothing at all for a response that matched no
 * pattern.
 *
 * `max` is the best a correct answer could have scored — the largest positive value among the `=`
 * patterns, since exactly one pattern ever resolves. Not the sum: matching two `=` patterns at once
 * still only earns one, so summing them would report a maximum no response could reach and drag
 * every percentage-based total (`percent_to_win`) down with it. */
export function gradeTypePatternQuestion(
  question: QuizScriptQuestion,
  response: string,
  revealed: ReadonlySet<number>
): QuestionResult {
  const matched = matchedPatternIndex(question, response);
  const earned =
    matched === null ? 0 : effectivePoints(question.options[matched], question.settings);

  const correctPoints = question.options
    .filter((o) => o.correct)
    .map((o) => effectivePoints(o, question.settings));
  const max = correctPoints.length > 0 ? Math.max(0, ...correctPoints) : 0;

  const reveal = gradeRevealExtras(question.extras, revealed);
  return { earned: earned + reveal.earned, max: max + reveal.max };
}

/** What the end-of-run Review screen shows for one already-answered question: the player's own
 * pick(s)/response, plus which hints they revealed — a read-only recap, not a re-editable draft. */
export type AnswerRecord =
  | { kind: 'choice'; selected: Set<number>; revealed: Set<number> }
  | { kind: 'type_answer'; response: string | string[]; revealed: Set<number> }
  /** `type_pattern` is always a single free-text response — no multi-guess, no character boxes —
   * so it records a plain string rather than `type_answer`'s string-or-array. */
  | { kind: 'type_pattern'; response: string; revealed: Set<number> }
  | {
      kind: 'guess_letters';
      guessedLetters: Map<string, 'correct' | 'wrong'>;
      extraPrerevealed: Set<number>;
      revealedPositions: Set<number>;
      revealed: Set<number>;
    }
  /** `placement` keeps its `null` holes rather than compacting them out — slot position IS the
   * answer for this variant (see `gradeOrderQuestion`), so a partly-filled board recorded as a
   * dense array would replay as a completely different set of placements on the Review screen
   * than the one that was actually graded. */
  | { kind: 'order_items'; placement: (number | null)[]; revealed: Set<number> }
  | { kind: 'match_pairs'; pairs: Map<number, number>; revealed: Set<number> }
  | { kind: 'group_items'; assignments: Map<number, number>; revealed: Set<number> }
  /** Carries both response shapes because this one kind covers both of the variant's modes:
   * `answers` is what was typed (`answer_mode=type`), `picks` which bank word went where
   * (`answer_mode=pick`). Only one is ever populated for a given question. */
  | {
      kind: 'fill_blanks';
      answers: string[];
      picks: (number | null)[];
      revealed: Set<number>;
    }
  /** `order_items`/`match_pairs`/`group_items` answered with `answer_mode=type` — there's no placement, pairing
   * or assignment to record, just the text typed into each slot. (`fill_blanks` keeps its own
   * kind for both of its modes, since its record already carries exactly this.) */
  | { kind: 'typed_slots'; answers: string[]; revealed: Set<number> };

/** Grades `draft` against `question`, dispatching to `gradeQuestion`/`gradeTypedQuestion`/
 * `gradeCharacterInputQuestion` and assembling the matching `AnswerRecord` in one call — the one
 * place that turns a draft into both a score and a recorded answer, so a live per-question submit
 * (immediate reveal) and a batched end-of-run grade (deferred reveal — see QuizPlayer.svelte)
 * always compute both identically. */
export function gradeDraft(
  question: QuizScriptQuestion,
  draft: QuestionDraft
): { result: QuestionResult; answer: AnswerRecord } {
  if (question.variant === 'type_answer') {
    const response = typedResponseFromDraft(question, draft);
    return {
      result: gradeTypedQuestion(question, response, draft.revealed),
      answer: { kind: 'type_answer', response, revealed: new Set(draft.revealed) }
    };
  }
  if (question.variant === 'type_pattern') {
    const response = draft.typedSingleAnswer;
    return {
      result: gradeTypePatternQuestion(question, response, draft.revealed),
      answer: { kind: 'type_pattern', response, revealed: new Set(draft.revealed) }
    };
  }
  if (question.variant === 'guess_letters') {
    return {
      result: gradeCharacterInputQuestion(question, draft),
      answer: {
        kind: 'guess_letters',
        guessedLetters: new Map(draft.guessedLetters),
        extraPrerevealed: new Set(draft.extraPrerevealed),
        revealedPositions: new Set(draft.revealedPositions),
        revealed: new Set(draft.revealed)
      }
    };
  }
  // The three board variants answer through `blankAnswers` instead when they're typed, so this has
  // to come before each of their own board-shaped branches below.
  if (
    isTypedAnswerMode(question) &&
    ['order_items', 'match_pairs', 'group_items'].includes(question.variant)
  ) {
    return {
      result: gradeTypedSlotsQuestion(question, draft.blankAnswers, draft.revealed),
      answer: {
        kind: 'typed_slots',
        answers: [...draft.blankAnswers],
        revealed: new Set(draft.revealed)
      }
    };
  }
  if (question.variant === 'order_items') {
    return {
      result: gradeOrderQuestion(question, draft.orderPlacement, draft.revealed),
      answer: {
        kind: 'order_items',
        placement: [...draft.orderPlacement],
        revealed: new Set(draft.revealed)
      }
    };
  }
  if (question.variant === 'match_pairs') {
    return {
      result: gradeMatchQuestion(question, draft.matchPairs, draft.revealed),
      answer: {
        kind: 'match_pairs',
        pairs: new Map(draft.matchPairs),
        revealed: new Set(draft.revealed)
      }
    };
  }
  if (question.variant === 'group_items') {
    return {
      result: gradeCategoriseQuestion(question, draft.categoriseAssignments, draft.revealed),
      answer: {
        kind: 'group_items',
        assignments: new Map(draft.categoriseAssignments),
        revealed: new Set(draft.revealed)
      }
    };
  }
  if (question.variant === 'fill_blanks') {
    return {
      result: gradeFillInBlanksQuestion(
        question,
        draft.blankAnswers,
        draft.blankPicks,
        draft.revealed
      ),
      answer: {
        kind: 'fill_blanks',
        answers: [...draft.blankAnswers],
        picks: [...draft.blankPicks],
        revealed: new Set(draft.revealed)
      }
    };
  }
  return {
    result: gradeQuestion(question, draft.selected, draft.revealed),
    answer: { kind: 'choice', selected: new Set(draft.selected), revealed: new Set(draft.revealed) }
  };
}

/** Inverse of `boxAnswer` — splits an already-assembled answer string back into one character per
 * box, padding short words and dropping overflow so the result always has exactly `sum(groups)`
 * entries regardless of what the string actually contains. Only ever needed to REPLAY a recorded
 * answer (see `draftFromAnswer`); nothing in the live answering path runs this direction. */
function boxCharsFromAnswer(answer: string, groups: number[]): string[] {
  const words = answer.split(' ');
  return groups.flatMap((len, g) =>
    Array.from({ length: len }, (_, i) => (words[g] ?? '')[i] ?? '')
  );
}

/** Rebuilds the `QuestionDraft` that produced `answer` — the inverse of the `AnswerRecord` half of
 * `gradeDraft`, for every variant. This is what lets the end-of-run Review screen re-render an
 * already-graded question through the very same `QuestionPlayer` that was used to answer it
 * (locked, with reveal styling) instead of a second, parallel set of read-only review components
 * that has to be kept in sync with the real one — which is exactly how every non-choice, non-typed
 * variant ended up silently unrenderable on that screen.
 *
 * `question` is needed only to decide which typed input mode a `'type_answer'` record's response belongs
 * in (single field / character boxes / banked guesses), the same three-way split
 * `typedResponseFromDraft` makes in the other direction. */
export function draftFromAnswer(question: QuizScriptQuestion, answer: AnswerRecord): QuestionDraft {
  const draft = blankDraft();
  draft.revealed = new Set(answer.revealed);

  switch (answer.kind) {
    case 'choice':
      draft.selected = new Set(answer.selected);
      break;
    case 'type_answer':
      if (Array.isArray(answer.response)) {
        draft.typedGuesses = [...answer.response];
      } else if (question.settings.typed_input === 'boxes') {
        draft.boxChars = boxCharsFromAnswer(answer.response, typedBoxGroups(question));
      } else {
        draft.typedSingleAnswer = answer.response;
      }
      break;
    case 'type_pattern':
      draft.typedSingleAnswer = answer.response;
      break;
    case 'guess_letters':
      draft.guessedLetters = new Map(answer.guessedLetters);
      draft.extraPrerevealed = new Set(answer.extraPrerevealed);
      draft.revealedPositions = new Set(answer.revealedPositions);
      break;
    case 'order_items':
      draft.orderPlacement = [...answer.placement];
      break;
    case 'match_pairs':
      draft.matchPairs = new Map(answer.pairs);
      break;
    case 'group_items':
      draft.categoriseAssignments = new Map(answer.assignments);
      break;
    case 'fill_blanks':
      draft.blankAnswers = [...answer.answers];
      draft.blankPicks = [...answer.picks];
      break;
    case 'typed_slots':
      draft.blankAnswers = [...answer.answers];
      break;
  }

  return draft;
}

/** Whether a RECORDED answer was a skip, for the screens that only kept the `AnswerRecord` (the
 * end-of-run summary list). Round-trips through `draftFromAnswer` so "empty" is defined exactly
 * once, in `isDraftEmpty`, rather than a second time over a different shape. */
export function isAnswerEmpty(question: QuizScriptQuestion, answer: AnswerRecord): boolean {
  return isDraftEmpty(question, draftFromAnswer(question, answer));
}

/** How a graded question reads to the player, for the reveal screen's own banner: full marks,
 * something-but-not-everything (only reachable with `partial_credit`), or nothing. Deliberately
 * derived from the score rather than from per-option correctness so one rule covers all seven
 * variants — including hint costs, which can legitimately drag a fully-correct answer down to
 * 'partial'. A question whose `max` is 0 (every option weighted `%0%`) reads as 'correct' at
 * `earned >= max`, since there was never anything to lose. */
export type AnswerVerdict = 'correct' | 'partial' | 'incorrect' | 'skipped';

/** `skipped` comes from `isDraftEmpty` at the call site rather than being inferred from the score,
 * because a zero is not evidence of a skip — a fully-worked wrong answer scores zero too, and the
 * player deserves to be told which of the two happened.
 *
 * It only wins while nothing was earned. A `type_pattern` question whose pattern matches the empty
 * string (`.*`) genuinely awards points for a blank response, and "Skipped" over a positive score
 * would read as a bug; the score-based verdict is the honest one there. */
export function answerVerdict(result: QuestionResult, skipped = false): AnswerVerdict {
  if (skipped && result.earned <= 0) return 'skipped';
  if (result.earned >= result.max) return 'correct';
  if (result.earned > 0) return 'partial';
  return 'incorrect';
}

/** A question's full achievable points — knowable upfront from the question and its settings
 * alone, regardless of what (if anything) the player has answered yet, since `max` never depends
 * on the response (see `gradeQuestion`/`gradeTypedQuestion`). Grading a blank draft is a cheap way
 * to get it without a separate "just the max" code path to keep in sync with the real one.
 * Exported so a player UI can show a quiz's total possible score (e.g. `show_running_score`'s persistent
 * header — see QuizPlayer.svelte) before or independent of any question actually being graded. */
export function questionMaxPoints(question: QuizScriptQuestion): number {
  return gradeDraft(question, blankDraft()).result.max;
}

/** group_items only: the distinct set of bucket labels across every option's `.target`, in
 * first-appearance order — group_items has no separate bucket-naming syntax (see quizScript.ts),
 * so the buckets a play/authoring UI renders are always derived from this. Exported so both
 * `buildPlayRun` (bucket display order) and the play/author UI (which buckets exist at all) share
 * one derivation instead of two copies that could drift. */
export function categoriseBuckets(question: QuizScriptQuestion): string[] {
  const seen = new Set<string>();
  const buckets: string[] = [];
  for (const option of question.options) {
    if (option.target === undefined) continue;
    const label = optionTargetText(option);
    if (seen.has(label)) continue;
    seen.add(label);
    buckets.push(label);
  }
  return buckets;
}

/** Variants whose display order is ALWAYS shuffled, never authored-order, regardless of a
 * `shuffle_options` setting — because `shuffle_options` isn't even offered to them (see quizScript.ts's
 * `SETTING_RULES.shuffle_options.appliesTo`). `order_items`'s authored sequence IS the answer, so showing it
 * unshuffled would give the answer away outright; `match_pairs`/`group_items`/`fill_blanks` don't leak
 * their answer through authored order the same way, but shuffling is still the only sensible
 * default — an unshuffled bank/item list would be a strange, unintentional-looking "hint" of its
 * own (e.g. two same-position columns in `match_pairs` silently pairing up by coincidence). */
const ALWAYS_SHUFFLED_VARIANTS = ['order_items', 'match_pairs', 'group_items', 'fill_blanks'];

export interface PlayQuestion {
  question: QuizScriptQuestion;
  /** This run's display order for the question's options (or, for `fill_blanks`, its word
   * bank), as indices into `question.options` — grading always works in terms of those original
   * indices; this only ever affects render order. */
  optionOrder: number[];
  /** `match_pairs`/`group_items` only: this run's display order for the right-hand column. For `match_pairs`,
   * indices into `question.options` (each option's own `.target` is that option's one
   * right-column entry). For `group_items`, indices into `categoriseBuckets(question)`'s derived
   * distinct-target array. `undefined` for every other variant. */
  targetOrder?: number[];
}

/** Builds one play session's question list: applies `questions_per_run` (random subset, when the
 * bank is larger) and `shuffle_questions` (defaults true) to the quiz-wide order, and each
 * question's own `shuffle_options` setting (or, for `ALWAYS_SHUFFLED_VARIANTS`, an unconditional shuffle)
 * to its option order — all resolved once, up front, so the run stays stable across re-renders
 * instead of re-shuffling on every read. */
export function buildPlayRun(
  questions: QuizScriptQuestion[],
  quizSettings: QuizScriptSettings
): PlayQuestion[] {
  const maxQuestions = settingNumber(quizSettings.questions_per_run);
  const shuffleQuestions = quizSettings.shuffle_questions !== false;

  // Picking a subset is itself already a random choice (something has to decide which ones to
  // drop) — shuffle_questions=false only opts out of shuffling whatever the pool ends up being.
  const pool =
    maxQuestions !== undefined && maxQuestions < questions.length
      ? shuffledArray(questions).slice(0, maxQuestions)
      : questions;
  const ordered = shuffleQuestions ? shuffledArray(pool) : pool;

  return ordered.map((authored) => {
    // Quiz-wide defaults are folded into each question's own settings HERE, once, so every
    // consumer downstream (grading, the boards, the reveal screen, the score header) reads a
    // single already-merged `settings` object instead of each having to remember to look in two
    // places — see `resolveQuestionSettings`.
    const question: QuizScriptQuestion = {
      ...authored,
      settings: resolveQuestionSettings(authored, quizSettings)
    };
    const indices = question.options.map((_, i) => i);
    const alwaysShuffled = ALWAYS_SHUFFLED_VARIANTS.includes(question.variant);
    const optionOrder =
      alwaysShuffled || settingBoolean(question.settings.shuffle_options)
        ? shuffledArray(indices)
        : indices;

    let targetOrder: number[] | undefined;
    if (question.variant === 'match_pairs') {
      targetOrder = shuffledArray(indices);
    } else if (question.variant === 'group_items') {
      const buckets = categoriseBuckets(question);
      targetOrder = shuffledArray(buckets.map((_, i) => i));
    }

    return { question, optionOrder, targetOrder };
  });
}

/** Whether answering a question locks it in on the spot, rather than leaving the player free to
 * move between questions and submit the whole run at the end: true when EITHER `reveal_answers` or
 * `reveal_scores` is `after_every_question`, because a live reveal makes revisiting that question
 * retroactively informative. The full reasoning lives in QuizPlayer.svelte's comment above
 * `locksAnswerImmediately`, which reads this rather than restating it — extracted because the
 * welcome screen's rules list (`buildQuizRules`) has to describe the same navigation model to the
 * player up front, and two copies of this decision could disagree. */
export function locksOnSubmit(quizSettings: QuizScriptSettings): boolean {
  return (
    settingString(quizSettings.reveal_answers, 'after_every_question') === 'after_every_question' ||
    settingString(quizSettings.reveal_scores, 'after_every_question') === 'after_every_question'
  );
}

export interface QuizRunResult {
  earned: number;
  max: number;
  percentage: number;
  won: boolean;
}

/** Combines every question's grade into the run's total and applies the quiz-wide win
 * threshold — `points_to_win` if set (an absolute target), else `percent_to_win`
 * (defaults to 75, per QUIZ_SETTING_RULES) against this run's own achievable max. */
export function gradeRun(
  results: QuestionResult[],
  quizSettings: QuizScriptSettings
): QuizRunResult {
  const earned = results.reduce((sum, r) => sum + r.earned, 0);
  const max = results.reduce((sum, r) => sum + r.max, 0);
  const percentage = max > 0 ? (earned / max) * 100 : 0;

  const pointsToWin = settingNumber(quizSettings.points_to_win);
  const won =
    pointsToWin !== undefined
      ? earned >= pointsToWin
      : percentage >= (settingNumber(quizSettings.percent_to_win) ?? 75);

  return { earned, max, percentage, won };
}
