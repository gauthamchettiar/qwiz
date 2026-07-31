<script lang="ts">
  import { CircleCheck, CircleX, Eye, Plus, RotateCcw, X } from '@lucide/svelte';
  import { optionLabelText, type QuizScriptQuestion } from '@/lib/utils/quizScript';
  import {
    blankDraft,
    boxAnswer,
    buildPlayRun,
    categoriseBuckets,
    characterInputAnswerText,
    characterInputLetterBank,
    characterInputLetterFullyRevealed,
    characterInputLetterInAnswer,
    characterInputNormalizeGuess,
    characterInputPrerevealedPositions,
    characterInputRevealPositionsAfterGuess,
    choiceOptionsLayoutClass,
    fillInBlanksAnswerOptions,
    gradeDraft,
    isDraftComplete,
    isGuessableChar,
    matchedPatternIndex,
    matchTypedGuesses,
    resolveExtraPrereveal,
    isTypedAnswerMode,
    settingNumber,
    typedBoxCount,
    typedSlotCorrectness,
    typedSlotCount,
    typedSlotExpectations,
    typedBoxGroups,
    typedSingleAnswerMatches,
    type PlayQuestion,
    type QuestionDraft
  } from '@/lib/utils/grading';
  import AnswerVerdict from './AnswerVerdict.svelte';
  import TypedSlotsBoard from './TypedSlotsBoard.svelte';
  import CharacterBank from './CharacterBank.svelte';
  import CategoriseBoard from './CategoriseBoard.svelte';
  import FillInBlanksBoard from './FillInBlanksBoard.svelte';
  import MatchBoard from './MatchBoard.svelte';
  import OptionContent from './OptionContent.svelte';
  import OrderBoard from './OrderBoard.svelte';

  // The one live "answer this question" widget, used two ways:
  // - `standalone` (QuestionCard's in-editor "try it" tester): owns its own Submit/Try-again cycle
  //   and always reveals everything once submitted — there's no surrounding run or quiz-wide
  //   reveal settings to defer to, just "does this question work the way I think it does".
  // - Embedded in a real run (QuizPlayer.svelte, both its immediate-lock and free-navigation
  //   modes): fully controlled from outside via `locked`/`revealAnswers`/`revealScores` — this
  //   component never decides on its own when to lock or what to reveal, and reports every input
  //   change up via `onDraftChange` so the parent can grade it, persist it across navigation, or
  //   both. Expects a FRESH mount per question (key on the question/index in the parent) — initial
  //   state is read from `draft` once, at creation, not kept in sync with prop changes afterwards.
  let {
    question,
    playQuestion: playQuestionProp,
    draft: initialDraft,
    locked = false,
    revealAnswers = true,
    revealScores = true,
    standalone = false,
    onDraftChange
  }: {
    question: QuizScriptQuestion;
    /** Pre-shuffled PlayQuestion from a run's own `buildPlayRun`, so this question's option order
     * matches the rest of that run. Omit for standalone testing, where there's no run to share a
     * shuffle with — one is computed locally instead. */
    playQuestion?: PlayQuestion;
    draft?: QuestionDraft;
    locked?: boolean;
    revealAnswers?: boolean;
    revealScores?: boolean;
    standalone?: boolean;
    onDraftChange?: (draft: QuestionDraft) => void;
  } = $props();

  const pq = $derived(playQuestionProp ?? buildPlayRun([question], {})[0]);
  const isTyped = $derived(question.variant === 'type_answer');
  // Regex-graded free text. Shares type_answer's single text field (and nothing else — no
  // multi-guess, no character boxes), but an entirely different reveal, since "the answer" here is
  // a set of patterns rather than a list of literal answers.
  const isPattern = $derived(question.variant === 'type_pattern');
  const isCharacterInput = $derived(question.variant === 'guess_letters');
  const isOrder = $derived(question.variant === 'order_items');
  const isMatch = $derived(question.variant === 'match_pairs');
  const isCategorise = $derived(question.variant === 'group_items');
  const categoriseBucketLabels = $derived(isCategorise ? categoriseBuckets(question) : []);
  const isFillInBlanks = $derived(question.variant === 'fill_blanks');
  const fillInBlanksAnswers = $derived(isFillInBlanks ? fillInBlanksAnswerOptions(question) : []);
  const fillInBlanksMode = $derived(
    question.settings.answer_mode === 'type' ? 'type' : ('pick' as const)
  );
  // order/match/group_items answered by typing (`:answer_mode=type`) swap their board for a plain
  // list of fields — see TypedSlotsBoard. fill_blanks keeps its own board either way, since its
  // typed mode is inline in the sentence rather than a separate list.
  const isTypedSlots = $derived(
    isTypedAnswerMode(question) && (isOrder || isMatch || isCategorise)
  );

  // Deliberately captured once, not `$derived` — this component expects a fresh mount per
  // question (see the doc comment above `$props()`), so `initialDraft` is only ever read at
  // creation. Routed through a function, same reasoning as `runExtraPrereveal`/
  // `runRevealedPositions` below: Svelte's `state_referenced_locally` check flags a reactive
  // prop read directly into a plain `const`, since that's usually a missed `$derived`.
  function initialSeed(): QuestionDraft {
    return initialDraft ?? blankDraft();
  }
  const seed = initialSeed();
  let selected = $state<Set<number>>(new Set(seed.selected));
  let revealedHints = $state<Set<number>>(new Set(seed.revealed));
  let typedSingleAnswer = $state(seed.typedSingleAnswer);
  let boxChars = $state<string[]>(seed.boxChars.length > 0 ? [...seed.boxChars] : runBoxChars());
  let typedGuesses = $state<string[]>([...seed.typedGuesses]);
  let typedGuessDraft = $state(seed.typedGuessDraft);
  let guessedLetters = $state<Map<string, 'correct' | 'wrong'>>(new Map(seed.guessedLetters));
  // `extraPrerevealed` (letters_shown_at_start's random extra positions) is resolved once here, at
  // mount, exactly like `boxChars`/`runBoxChars()` above — reused from a persisted draft if one
  // exists, otherwise freshly randomized (which `blankDraft()` deliberately can't do itself, since
  // it has no `question` to resolve against — see QuestionDraft's own doc comment). Routed through
  // a local function, same as `runBoxChars()`, so this one-time-capture-at-mount read of `question`
  // doesn't read as a missed-reactivity bug (Svelte's `state_referenced_locally` check only looks
  // for a state/prop reference directly inside a `$state(...)` initializer, not one hidden behind
  // a function call — intentional here, not an oversight, per this component's own doc comment on
  // reading `draft` once at creation rather than staying in sync with prop changes afterwards).
  function runExtraPrereveal(): Set<number> {
    return resolveExtraPrereveal(question);
  }
  let extraPrerevealed = $state<Set<number>>(
    seed.extraPrerevealed.size > 0 ? new Set(seed.extraPrerevealed) : runExtraPrereveal()
  );
  function runRevealedPositions(): Set<number> {
    return new Set(characterInputPrerevealedPositions(question, extraPrerevealed));
  }
  let revealedPositions = $state<Set<number>>(
    seed.revealedPositions.size > 0 ? new Set(seed.revealedPositions) : runRevealedPositions()
  );
  // order only: one slot per option, sized fresh (all-empty) unless a persisted draft already has
  // the right number of slots — same "reuse a persisted seed, else resolve fresh at mount" pattern
  // as `boxChars`/`runBoxChars()` above.
  function runOrderPlacement(): (number | null)[] {
    return new Array(question.options.length).fill(null);
  }
  let orderPlacement = $state<(number | null)[]>(
    seed.orderPlacement.length === question.options.length
      ? [...seed.orderPlacement]
      : runOrderPlacement()
  );
  let picked = $state<number | null>(seed.picked);
  // match only: left original option index -> right original option index (whose own `.target`
  // is what's displayed there) — see `pickMatchLeft`/`clickMatchRight` below.
  let matchPairs = $state<Map<number, number>>(new Map(seed.matchPairs));
  // group_items only: original option index -> bucket index into `categoriseBuckets(question)`.
  let categoriseAssignments = $state<Map<number, number>>(new Map(seed.categoriseAssignments));
  // answer_mode=type only: one entry per typed slot, sized fresh (all-empty) unless a persisted
  // draft already has the right number — same pattern as `orderPlacement`/`runOrderPlacement`.
  function runBlankAnswers(): string[] {
    return new Array(typedSlotCount(question)).fill('');
  }
  let blankAnswers = $state<string[]>(
    seed.blankAnswers.length === typedSlotCount(question)
      ? [...seed.blankAnswers]
      : runBlankAnswers()
  );
  // fill_blanks in answer_mode=pick only: one entry per blank, holding the option index of the
  // bank word placed there. Sized off the same slot count, so switching a question's answer_mode
  // never leaves a stale array of the wrong length behind.
  function runBlankPicks(): (number | null)[] {
    return new Array(typedSlotCount(question)).fill(null);
  }
  let blankPicks = $state<(number | null)[]>(
    seed.blankPicks.length === typedSlotCount(question) ? [...seed.blankPicks] : runBlankPicks()
  );
  let boxRefs: HTMLInputElement[] = $state([]);
  let typedSingleInputRef: HTMLInputElement | undefined = $state();
  let typedGuessInputRef: HTMLInputElement | undefined = $state();

  // Standalone mode manages its own lock/reveal cycle (Submit -> reveal -> Try again, looping on
  // the same question); embedded mode is entirely driven by the `locked` prop instead.
  let standaloneLocked = $state(false);
  const isLocked = $derived(standalone ? standaloneLocked : locked);

  function runBoxChars(): string[] {
    return new Array(typedBoxCount(question)).fill('');
  }

  /** The border+background for one choice option, as a SINGLE mutually-exclusive class string.
   *
   * Deliberately not two class strings layered "base, then a reveal override on top": which of two
   * conflicting utilities wins is decided by their order in the generated stylesheet, not by their
   * order in the attribute, so `bg-indigo-50 bg-green-50` resolved to indigo (it comes later in
   * Tailwind's palette) and an option the player got RIGHT rendered as merely "selected" instead of
   * correct — while a correct option they didn't pick rendered green, right next to it. Any place
   * that needs one of several exclusive looks has to pick exactly one, not stack them. */
  function choiceOptionTone(optionIndex: number, correct: boolean): string {
    if (isLocked && revealAnswers) {
      if (correct) return 'border-green-400 bg-green-50';
      return selected.has(optionIndex) ? 'border-red-400 bg-red-50' : 'border-slate-200';
    }
    return selected.has(optionIndex)
      ? 'border-indigo-300 bg-indigo-50'
      : 'border-slate-200 hover:bg-slate-50';
  }

  function currentDraft(): QuestionDraft {
    return {
      selected: new Set(selected),
      revealed: new Set(revealedHints),
      typedSingleAnswer,
      boxChars: [...boxChars],
      typedGuesses: [...typedGuesses],
      typedGuessDraft,
      guessedLetters: new Map(guessedLetters),
      extraPrerevealed: new Set(extraPrerevealed),
      revealedPositions: new Set(revealedPositions),
      orderPlacement: [...orderPlacement],
      picked,
      matchPairs: new Map(matchPairs),
      categoriseAssignments: new Map(categoriseAssignments),
      blankAnswers: [...blankAnswers],
      blankPicks: [...blankPicks]
    };
  }

  // Fires on every change to any of the state read inside `currentDraft()` — the parent (in
  // embedded mode) uses this to persist the in-progress answer and to grade it once submitted.
  $effect(() => {
    onDraftChange?.(currentDraft());
  });

  const result = $derived(isLocked ? gradeDraft(question, currentDraft()).result : null);
  const canSubmit = $derived(isDraftComplete(question, currentDraft()));

  const minAnswers = $derived(settingNumber(question.settings.min_answers) ?? 0);
  const maxAnswers = $derived(settingNumber(question.settings.max_answers));
  // Keyed off the variant itself (not `maxAnswers === 1`, the old proxy) — a pick_one
  // question always renders as a radio group regardless of whether it also sets max_answers, and
  // a pick_many question with max_answers=1 (a real, if unusual, thing to author) still
  // renders as checkboxes, since it's still a "pick from a set" question, just capped at one pick.
  const isSingleSelect = $derived(question.variant === 'pick_one');
  const isMultiGuess = $derived(isTyped && maxAnswers !== undefined && maxAnswers > 1);
  const isBoxes = $derived(isTyped && question.settings.typed_input === 'boxes');
  const boxGroups = $derived(isBoxes ? typedBoxGroups(question) : []);
  const boxCount = $derived(isBoxes ? typedBoxCount(question) : 0);

  const characterInputText = $derived(isCharacterInput ? characterInputAnswerText(question) : '');
  const bankLetters = $derived(isCharacterInput ? characterInputLetterBank(question) : []);
  // Every position revealed right now — the actual `revealedPositions` progress, unless this
  // question is locked with answers being revealed, in which case the full word shows regardless
  // of how far the player actually got (same "reveal everything once locked+revealAnswers" idea
  // as typed's `typedRevealed` snippet showing the full accepted-answer list).
  const displayedRevealedPositions = $derived(
    isLocked && revealAnswers
      ? new Set(Array.from({ length: characterInputText.length }, (_, i) => i))
      : revealedPositions
  );
  // A bank letter disables once it can't do anything more: guessed wrong (no more tries), or
  // every one of its occurrences is already revealed — which covers two cases with the same
  // check, since `revealedPositions` starts out equal to the pre-reveal set (bracket/
  // letters_shown_at_start) and only grows from there: a letter that's entirely pre-revealed disables
  // from the very first render (nothing left for a click to do), and a correctly-guessed letter
  // disables once letter_reveal has finished trickling out all its occurrences (immediately for
  // `all`; only after enough repeat clicks for `sequence`/`random` on a repeating letter).
  const disabledBankLetters = $derived(
    new Set(
      bankLetters.filter(
        (letter) =>
          guessedLetters.get(letter) === 'wrong' ||
          characterInputLetterFullyRevealed(question, revealedPositions, letter)
      )
    )
  );

  // Auto-focus the answer field the moment this mounts unlocked — the first box in
  // `typed_input=boxes` mode, otherwise the plain text field. A fresh mount per question (see
  // the component doc comment above) means this firing once on creation is enough; there's no
  // "question changed under an existing instance" case to also handle.
  $effect(() => {
    if (isLocked || !isTyped) return;
    if (isBoxes) {
      boxRefs[0]?.focus();
    } else if (isMultiGuess) {
      typedGuessInputRef?.focus();
    } else {
      typedSingleInputRef?.focus();
    }
  });

  function toggleOption(optionIndex: number) {
    if (isLocked) return;
    if (selected.has(optionIndex)) {
      selected = new Set([...selected].filter((i) => i !== optionIndex));
    } else {
      if (maxAnswers !== undefined && selected.size >= maxAnswers) return; // already at the cap
      selected = new Set([...selected, optionIndex]);
    }
  }

  function selectSingle(optionIndex: number) {
    if (isLocked) return;
    selected = new Set([optionIndex]);
  }

  // --- order/match/group_items/fill_blanks placement ---------------------------------------
  //
  // Each board supports two ways to place an item, and both go through the same `place*`/`assign*`
  // primitive below so they can't drift apart:
  //
  // - TAP: tap an item to pick it up (`picked`), then tap a target. Keyboard-operable for free,
  //   since every item and target is a plain `<button>` — this is the accessible path, and the
  //   only one on which anything else depends.
  // - DRAG: press and drag an item onto a target (see lib/utils/dragDrop.ts). A pointer-only
  //   enhancement; the `drop*` handlers below are its entry point, and differ from the tap handlers
  //   only in taking the item explicitly instead of reading whatever happens to be `picked`.

  /** A drop on an item's own source list rather than on a real target — "put this back". Boards
   * mark their bank/pool with this as its `data-drop-zone` (see `SOURCE_ZONE` in each board). */
  const SOURCE_ZONE = -1;

  /** Moves `optionIndex` into `slotIndex`, returning whatever ends up with nowhere to go (`null` if
   * nothing does). Dropping onto a filled slot SWAPS when the incoming item came from another slot
   * — its old slot takes the displaced occupant — since a swap is what "put this one here instead"
   * obviously means once both are already in the sequence. An item arriving from the bank has no
   * slot to donate, so the occupant it displaces is handed back to the caller instead. */
  function placeOrderItem(optionIndex: number, slotIndex: number): number | null {
    const next = [...orderPlacement];
    const occupant = next[slotIndex];
    const fromSlot = next.indexOf(optionIndex);
    next[slotIndex] = optionIndex;
    if (fromSlot !== -1) next[fromSlot] = occupant;
    orderPlacement = next;
    return fromSlot === -1 ? occupant : null;
  }

  function removeOrderItem(optionIndex: number) {
    orderPlacement = orderPlacement.map((occupant) => (occupant === optionIndex ? null : occupant));
  }

  function pickOrderItem(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  /** Tapping a target: place what's held (keeping any displaced item in hand, ready for the next
   * tap), or — with nothing held — pick the target's own occupant back up. */
  function clickOrderSlot(slotIndex: number) {
    if (isLocked) return;
    if (picked !== null) {
      picked = placeOrderItem(picked, slotIndex);
      return;
    }
    const occupant = orderPlacement[slotIndex];
    if (occupant !== null) {
      removeOrderItem(occupant);
      picked = occupant;
    }
  }

  function dropOrderItem(optionIndex: number, zone: number) {
    if (isLocked) return;
    if (zone === SOURCE_ZONE) removeOrderItem(optionIndex);
    else placeOrderItem(optionIndex, zone);
    // A drag has no "still in hand" state to leave anything in — the gesture is over.
    picked = null;
  }

  /** Pairs `leftIndex` with `rightIndex`, dropping whatever either side was previously part of: a
   * right target can only belong to one pair at a time, and so can a left item. */
  function pairMatch(leftIndex: number, rightIndex: number) {
    matchPairs = new Map([
      ...[...matchPairs].filter(([left, right]) => left !== leftIndex && right !== rightIndex),
      [leftIndex, rightIndex]
    ]);
  }

  function pickMatchLeft(leftIndex: number) {
    if (isLocked) return;
    if (picked === leftIndex) {
      picked = null;
      return;
    }
    matchPairs = new Map([...matchPairs].filter(([left]) => left !== leftIndex));
    picked = leftIndex;
  }

  /** Tapping a right target completes the held pair; tapping an already-paired one with nothing
   * held un-pairs it and picks its left item back up — the same "reclaim an occupied target" idea
   * as order's board. */
  function clickMatchRight(rightIndex: number) {
    if (isLocked) return;
    if (picked !== null) {
      pairMatch(picked, rightIndex);
      picked = null;
      return;
    }
    const existingLeft = [...matchPairs].find(([, right]) => right === rightIndex)?.[0];
    if (existingLeft !== undefined) {
      matchPairs = new Map([...matchPairs].filter(([left]) => left !== existingLeft));
      picked = existingLeft;
    }
  }

  function dropMatch(leftIndex: number, rightIndex: number) {
    if (isLocked) return;
    pairMatch(leftIndex, rightIndex);
    picked = null;
  }

  /** Unlike match, a bucket holds any number of items at once, so assigning never evicts anything
   * already there — only the item's own previous bucket is vacated. */
  function assignCategorise(optionIndex: number, bucketIndex: number) {
    categoriseAssignments = new Map([
      ...[...categoriseAssignments].filter(([option]) => option !== optionIndex),
      [optionIndex, bucketIndex]
    ]);
  }

  function unassignCategorise(optionIndex: number) {
    categoriseAssignments = new Map(
      [...categoriseAssignments].filter(([option]) => option !== optionIndex)
    );
  }

  function pickCategoriseItem(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  function clickCategoriseBucket(bucketIndex: number) {
    if (isLocked || picked === null) return;
    assignCategorise(picked, bucketIndex);
    picked = null;
  }

  function pickCategoriseItemBackUp(optionIndex: number) {
    if (isLocked) return;
    unassignCategorise(optionIndex);
    picked = optionIndex;
  }

  function dropCategoriseItem(optionIndex: number, zone: number) {
    if (isLocked) return;
    if (zone === SOURCE_ZONE) unassignCategorise(optionIndex);
    else assignCategorise(optionIndex, zone);
    picked = null;
  }

  /** fill_blanks (answer_mode=pick): a blank holds the option INDEX of the bank word placed in it.
   * A word can be a picture, which has no text to record, and an index also keeps "this bank
   * button is used up" exact when two words are spelled the same (see `gradeFillInBlanksQuestion`,
   * which still compares the words themselves when scoring). A word already sitting in another
   * blank is moved rather than duplicated — the bank holds one of each. */
  function fillBlank(blankIndex: number, optionIndex: number) {
    const next = blankPicks.map((p) => (p === optionIndex ? null : p));
    next[blankIndex] = optionIndex;
    blankPicks = next;
  }

  function clearBlank(blankIndex: number) {
    const next = [...blankPicks];
    next[blankIndex] = null;
    blankPicks = next;
  }

  function pickBankWord(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  function clickBlank(blankIndex: number) {
    if (isLocked) return;
    if (picked !== null) {
      fillBlank(blankIndex, picked);
      picked = null;
      return;
    }
    const occupant = blankPicks[blankIndex];
    if (occupant === null || occupant === undefined) return;
    // Pick it back up — exactly the word that's in there, since the blank records which option it
    // was rather than what it said.
    clearBlank(blankIndex);
    picked = occupant;
  }

  function dropBankWord(optionIndex: number, blankIndex: number) {
    if (isLocked) return;
    fillBlank(blankIndex, optionIndex);
    picked = null;
  }

  /** Dragging a filled blank back onto the word bank empties it — the drag counterpart of tapping
   * a filled blank, which instead picks its word back up into `picked`. */
  function dropBlankBack(blankIndex: number, zone: number) {
    if (isLocked || zone !== SOURCE_ZONE) return;
    clearBlank(blankIndex);
    picked = null;
  }

  // fill_blanks (answer_mode=type) — a plain per-blank text input, no picking involved.
  function setBlankText(blankIndex: number, value: string) {
    if (isLocked) return;
    const next = [...blankAnswers];
    next[blankIndex] = value;
    blankAnswers = next;
  }

  function revealHint(extraIndex: number) {
    if (isLocked || revealedHints.has(extraIndex)) return;
    revealedHints = new Set([...revealedHints, extraIndex]);
  }

  // A bank-letter click. Three cases: a letter already guessed wrong (no more tries, and the
  // button should already be disabled — this is just a defensive no-op); a letter already guessed
  // correct but not fully revealed yet (`letter_reveal=sequence`/`random` on a repeating letter) —
  // reveals the next occurrence without re-scoring, since it was already counted on the first
  // correct guess; and a fresh guess, which both records correct/wrong in `guessedLetters` and, if
  // correct, reveals via `characterInputRevealPositionsAfterGuess`.
  function guessLetter(rawLetter: string) {
    if (isLocked) return;
    const letter = characterInputNormalizeGuess(rawLetter);
    const status = guessedLetters.get(letter);
    if (status === 'wrong') return;
    if (status === 'correct') {
      if (characterInputLetterFullyRevealed(question, revealedPositions, letter)) return;
      revealedPositions = characterInputRevealPositionsAfterGuess(
        question,
        revealedPositions,
        letter
      );
      return;
    }
    const correct = characterInputLetterInAnswer(question, letter);
    guessedLetters = new Map([...guessedLetters, [letter, correct ? 'correct' : 'wrong'] as const]);
    if (correct) {
      revealedPositions = characterInputRevealPositionsAfterGuess(
        question,
        revealedPositions,
        letter
      );
    }
  }

  function setBoxChar(i: number, raw: string) {
    if (isLocked) return;
    const next = [...boxChars];
    next[i] = raw.slice(-1); // keep only the last character if the box somehow ends up with more
    boxChars = next;
    if (next[i] && i < boxCount - 1) boxRefs[i + 1]?.focus();
  }

  function onBoxKeydown(i: number, e: KeyboardEvent) {
    if (e.key === ' ') {
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (i > 0) boxRefs[i - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (i < boxCount - 1) boxRefs[i + 1]?.focus();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isMultiGuess) bankGuess();
      else if (standalone && canSubmit) submitAnswer();
      return;
    }
    if (e.key !== 'Backspace') return;
    e.preventDefault();
    if (boxChars[i]) {
      setBoxChar(i, '');
    } else if (i > 0) {
      setBoxChar(i - 1, '');
      boxRefs[i - 1]?.focus();
    }
  }

  function bankGuess() {
    if (isLocked || (maxAnswers !== undefined && typedGuesses.length >= maxAnswers)) return;
    if (isBoxes) {
      if (boxChars.length === 0 || !boxChars.every((c) => c !== '')) return; // not every box filled yet
      typedGuesses = [...typedGuesses, boxAnswer(boxChars, boxGroups)];
      boxChars = runBoxChars();
      boxRefs[0]?.focus(); // cursor back to the start of the row, ready for the next guess
      return;
    }
    const guess = typedGuessDraft.trim();
    if (!guess) return;
    typedGuesses = [...typedGuesses, guess];
    typedGuessDraft = '';
  }

  function removeGuess(index: number) {
    if (isLocked) return;
    typedGuesses = typedGuesses.filter((_, i) => i !== index);
  }

  function submitAnswer() {
    if (!standalone || standaloneLocked || !canSubmit) return;
    standaloneLocked = true;
  }

  function reset() {
    standaloneLocked = false;
    selected = new Set();
    revealedHints = new Set();
    typedSingleAnswer = '';
    typedGuesses = [];
    typedGuessDraft = '';
    boxChars = runBoxChars();
    guessedLetters = new Map();
    // A fresh game re-rolls letters_shown_at_start's random picks, same as a real Hangman round starting
    // over — a "Try again" is a new session, not a resumption of the old one.
    extraPrerevealed = runExtraPrereveal();
    revealedPositions = runRevealedPositions();
  }
</script>

{#snippet boxRow()}
  <div class="flex flex-wrap items-center gap-6">
    {#each boxGroups as groupLen, g (g)}
      {@const offset = boxGroups.slice(0, g).reduce((sum, n) => sum + n, 0)}
      <div class="flex items-center gap-1.5">
        {#each Array.from({ length: groupLen }) as _, j (j)}
          {@const i = offset + j}
          <input
            bind:this={boxRefs[i]}
            type="text"
            maxlength="1"
            class="h-10 w-8 rounded-md border border-slate-300 text-center text-lg font-medium text-slate-900 focus:border-slate-400 focus:outline-none"
            value={boxChars[i] ?? ''}
            oninput={(e) => {
              if (e.currentTarget.value.slice(-1) === ' ') {
                e.currentTarget.value = boxChars[i] ?? '';
                return;
              }
              setBoxChar(i, e.currentTarget.value);
            }}
            onkeydown={(e) => onBoxKeydown(i, e)}
            onfocus={(e) => e.currentTarget.select()}
            onclick={(e) => e.currentTarget.select()}
          />
        {/each}
      </div>
    {/each}
  </div>
{/snippet}

<!-- guess_letters's answer display: one box per guessable letter (revealed/blank per
     displayedRevealedPositions), non-letter characters (spaces, punctuation) shown plainly since
     they're never part of the guessing game — see isGuessableChar in grading.ts. -->
{#snippet characterInputRow()}
  <div class="flex flex-wrap items-center gap-1" role="group" aria-label="Answer, revealed so far">
    {#each characterInputText.split('') as char, i (i)}
      {#if !isGuessableChar(char)}
        <span class="flex h-10 w-4 items-center justify-center text-lg font-medium text-slate-900"
          >{char}</span
        >
      {:else}
        {@const shown = displayedRevealedPositions.has(i)}
        <span
          class="flex h-10 w-8 items-center justify-center rounded-md border text-lg font-medium {shown
            ? 'border-slate-300 bg-slate-50 text-slate-900'
            : 'border-slate-300 bg-white text-slate-300'}"
        >
          {shown ? char : '_'}
        </span>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet typedAcceptedAnswers()}
  <div class="mt-2">
    <p class="text-xs font-medium text-slate-500">Accepted answers</p>
    <div class="mt-1 flex flex-wrap gap-1.5">
      {#each question.options as option, i (i)}
        {#if option.content.kind === 'text'}
          <span
            class="rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
          >
            {option.content.text}
          </span>
        {/if}
      {/each}
    </div>
  </div>
{/snippet}

<!-- The locked-and-revealed view for a typed question's response(s) vs the accepted-answer list. -->
{#snippet typedRevealed(response: string | string[])}
  {#if typeof response === 'string'}
    {@const matched = typedSingleAnswerMatches(question.options, response, question.settings)}
    <div
      class="rounded-md border p-3 {matched !== null
        ? 'border-green-400 bg-green-50'
        : 'border-red-400 bg-red-50'}"
    >
      <p class="flex items-center gap-1.5 text-sm text-slate-900">
        {#if matched !== null}<CircleCheck
            size={14}
            class="shrink-0 text-green-600"
          />{:else}<CircleX size={14} class="shrink-0 text-red-500" />{/if}
        {response.trim() || '(left blank)'}
      </p>
    </div>
  {:else}
    {@const { perGuess } = matchTypedGuesses(question.options, response, question.settings)}
    <div class="flex flex-wrap gap-1.5">
      {#each response as guess, i (i)}
        {@const status = perGuess[i]?.status}
        <span
          class="rounded-md border px-2 py-0.5 text-xs font-medium {status === 'matched'
            ? 'border-green-300 bg-green-50 text-green-700'
            : status === 'wrong'
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-slate-300 bg-slate-50 text-slate-500'}"
        >
          {guess.trim() || '(blank)'}
        </span>
      {/each}
    </div>
  {/if}
  {@render typedAcceptedAnswers()}
{/snippet}

<!-- type_pattern's locked-and-revealed view. Shows WHICH pattern caught the response, not just
     whether it was right: with regex answers the interesting information is the rule, and an author
     debugging their own question needs to see which of several patterns actually fired. The `~`
     patterns are listed too — an explicitly-wrong pattern is part of the answer key here, unlike
     a plain distractor. -->
{#snippet patternRevealed(response: string)}
  {@const matched = matchedPatternIndex(question, response)}
  {@const isRight = matched !== null && question.options[matched].correct}
  <div
    class="rounded-md border p-3 {isRight
      ? 'border-green-400 bg-green-50'
      : 'border-red-400 bg-red-50'}"
  >
    <p class="flex items-center gap-1.5 text-sm text-slate-900">
      {#if isRight}<CircleCheck size={14} class="shrink-0 text-green-600" />{:else}<CircleX
          size={14}
          class="shrink-0 text-red-500"
        />{/if}
      {response.trim() || '(left blank)'}
    </p>
  </div>
  <div class="mt-2">
    <p class="text-xs font-medium text-slate-500">Patterns</p>
    <div class="mt-1 space-y-1">
      {#each question.options as option, i (i)}
        {#if option.content.kind === 'text'}
          <p class="flex items-start gap-1.5 text-xs">
            <span
              class="shrink-0 font-semibold {option.correct ? 'text-green-700' : 'text-red-600'}"
              >{option.correct ? 'correct' : 'wrong'}</span
            >
            <code class="min-w-0 break-all font-mono text-slate-700">{option.content.text}</code>
            {#if i === matched}
              <span class="shrink-0 font-semibold text-slate-500">← matched</span>
            {/if}
          </p>
        {/if}
      {/each}
    </div>
  </div>
{/snippet}

<!-- Locked but NOT revealing correctness (reveal_answers=at_end/never — see QuizPlayer.svelte):
     just what the player typed, with no color/marking and no accepted-answer list yet. -->
{#snippet typedLockedNeutral(response: string | string[])}
  <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
    {#if typeof response === 'string'}
      <p class="text-sm text-slate-700">{response.trim() || '(left blank)'}</p>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each response as guess, i (i)}
          <span
            class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700"
          >
            {guess.trim() || '(blank)'}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="space-y-4">
  <!-- Leads the locked question rather than trailing it: on the run's post-answer screen this is
       the whole reason the screen exists, and burying the outcome under the board the player just
       filled in made "did I get it right?" something they had to work out for themselves from the
       green/red option tinting. -->
  {#if isLocked && result && (revealAnswers || revealScores)}
    <AnswerVerdict {result} showVerdict={revealAnswers} showScore={revealScores} />
  {/if}

  {#if !isFillInBlanks}
    <p class="whitespace-pre-wrap text-base font-medium text-slate-900">{question.text}</p>
  {/if}

  {#each question.media as media, i (i)}
    <OptionContent content={media} />
  {/each}

  {#each question.extras as extra, i (i)}
    <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
      {#if revealedHints.has(i)}
        <p class="flex items-center gap-1 text-xs font-medium text-slate-500">
          <Eye size={12} />
          {extra.label || 'Hint'}
        </p>
        <p class="mt-1 text-sm text-slate-700">{extra.content}</p>
      {:else}
        <button
          type="button"
          class="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-500 disabled:no-underline"
          disabled={isLocked}
          onclick={() => revealHint(i)}
        >
          <Eye size={14} />
          {extra.label || 'Reveal hint'}
          {#if extra.points !== 0}
            <span class="text-xs text-slate-500"
              >({extra.points > 0 ? '+' : ''}{extra.points} pts)</span
            >
          {/if}
        </button>
      {/if}
    </div>
  {/each}

  {#if isPattern}
    {#if isLocked}
      {#if revealAnswers}
        {@render patternRevealed(typedSingleAnswer)}
      {:else}
        {@render typedLockedNeutral(typedSingleAnswer)}
      {/if}
    {:else}
      <input
        bind:this={typedSingleInputRef}
        type="text"
        class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        placeholder="Type your answer"
        bind:value={typedSingleAnswer}
      />
    {/if}
  {:else if isTyped}
    {@const response = isMultiGuess
      ? typedGuesses
      : isBoxes
        ? boxAnswer(boxChars, boxGroups)
        : typedSingleAnswer}
    {#if isLocked}
      {#if revealAnswers}
        {@render typedRevealed(response)}
      {:else}
        {@render typedLockedNeutral(response)}
      {/if}
    {:else if isMultiGuess}
      {#if typedGuesses.length > 0}
        <div class="flex flex-wrap gap-1.5">
          {#each typedGuesses as guess, i (i)}
            <span
              class="flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
            >
              {guess}
              <button
                type="button"
                onclick={() => removeGuess(i)}
                aria-label={`Remove guess "${guess}"`}
                class="text-slate-400 hover:text-slate-700"
              >
                <X size={12} />
              </button>
            </span>
          {/each}
        </div>
      {/if}
      {#if isBoxes}
        <div class="flex flex-wrap items-center gap-2">
          {@render boxRow()}
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={boxChars.length === 0 ||
              !boxChars.every((c) => c !== '') ||
              (maxAnswers !== undefined && typedGuesses.length >= maxAnswers)}
            onclick={bankGuess}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      {:else}
        <div class="flex gap-1.5">
          <input
            bind:this={typedGuessInputRef}
            type="text"
            class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
            placeholder="Type a guess and press Enter"
            bind:value={typedGuessDraft}
            disabled={maxAnswers !== undefined && typedGuesses.length >= maxAnswers}
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                bankGuess();
              }
            }}
          />
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={typedGuessDraft.trim() === '' ||
              (maxAnswers !== undefined && typedGuesses.length >= maxAnswers)}
            onclick={bankGuess}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      {/if}
    {:else if isBoxes}
      {@render boxRow()}
    {:else}
      <input
        bind:this={typedSingleInputRef}
        type="text"
        class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none"
        placeholder="Type your answer"
        bind:value={typedSingleAnswer}
      />
    {/if}
  {:else if isCharacterInput}
    {@render characterInputRow()}
    <CharacterBank
      letters={bankLetters}
      {guessedLetters}
      disabledLetters={disabledBankLetters}
      locked={isLocked}
      onGuess={guessLetter}
    />
  {:else if isTypedSlots}
    {@const expectations = typedSlotExpectations(question)}
    {@const correctness = typedSlotCorrectness(question, blankAnswers)}
    <TypedSlotsBoard
      slots={isOrder
        ? question.options.map((_, i) => ({ label: `${i + 1}.`, name: `position ${i + 1}` }))
        : pq.optionOrder.map((i) => ({
            content: question.options[i].content,
            name: optionLabelText(question.options[i])
          }))}
      answers={isOrder ? blankAnswers : pq.optionOrder.map((i) => blankAnswers[i] ?? '')}
      caption={isOrder
        ? 'Type the item that belongs at each position'
        : isMatch
          ? 'Type what each item matches with'
          : 'Type the category each item belongs to'}
      placeholder={isOrder ? 'Item' : isMatch ? 'Matches with' : 'Category'}
      reference={isOrder ? pq.optionOrder.map((i) => question.options[i].content) : []}
      referenceLabel="Items to place, in no particular order"
      correctness={isOrder ? correctness : pq.optionOrder.map((i) => correctness[i])}
      expectations={isOrder ? expectations : pq.optionOrder.map((i) => expectations[i])}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onType={(slot, value) => setBlankText(isOrder ? slot : pq.optionOrder[slot], value)}
    />
  {:else if isOrder}
    <OrderBoard
      options={question.options}
      optionOrder={pq.optionOrder}
      placement={orderPlacement}
      {picked}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onPick={pickOrderItem}
      onSlotClick={clickOrderSlot}
      onDrop={dropOrderItem}
    />
  {:else if isMatch}
    <MatchBoard
      options={question.options}
      leftOrder={pq.optionOrder}
      rightOrder={pq.targetOrder ?? []}
      pairs={matchPairs}
      {picked}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onPickLeft={pickMatchLeft}
      onClickRight={clickMatchRight}
      onDrop={dropMatch}
    />
  {:else if isCategorise}
    <CategoriseBoard
      options={question.options}
      itemOrder={pq.optionOrder}
      buckets={categoriseBucketLabels}
      bucketOrder={pq.targetOrder ?? []}
      assignments={categoriseAssignments}
      {picked}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onPickItem={pickCategoriseItem}
      onPickItemBackUp={pickCategoriseItemBackUp}
      onClickBucket={clickCategoriseBucket}
      onDrop={dropCategoriseItem}
    />
  {:else if isFillInBlanks}
    <FillInBlanksBoard
      text={question.text}
      options={question.options}
      bankOrder={pq.optionOrder}
      {blankAnswers}
      {blankPicks}
      answerOptions={fillInBlanksAnswers}
      {picked}
      mode={fillInBlanksMode}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onPickBankWord={pickBankWord}
      onClickBlank={clickBlank}
      onTypeBlank={setBlankText}
      onDropWord={dropBankWord}
      onDropBlankBack={dropBlankBack}
    />
  {:else}
    <div class={choiceOptionsLayoutClass(question)}>
      {#each pq.optionOrder as optionIndex (optionIndex)}
        {@const option = question.options[optionIndex]}
        <label
          class="flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors {choiceOptionTone(
            optionIndex,
            option.correct
          )}"
        >
          {#if isSingleSelect}
            <input
              type="radio"
              name={`question-${question.text}-options`}
              class="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
              checked={selected.has(optionIndex)}
              disabled={isLocked}
              onchange={() => selectSingle(optionIndex)}
            />
          {:else}
            <input
              type="checkbox"
              class="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
              checked={selected.has(optionIndex)}
              disabled={isLocked ||
                (maxAnswers !== undefined &&
                  selected.size >= maxAnswers &&
                  !selected.has(optionIndex))}
              onchange={() => toggleOption(optionIndex)}
            />
          {/if}
          <div class="min-w-0 flex-1">
            <OptionContent content={option.content} />
          </div>
          {#if isLocked && revealAnswers}
            {#if option.correct}
              <CircleCheck size={16} class="mt-1 shrink-0 text-green-600" />
            {:else if selected.has(optionIndex)}
              <CircleX size={16} class="mt-1 shrink-0 text-red-500" />
            {/if}
          {/if}
        </label>
      {/each}
    </div>
  {/if}

  {#if !isLocked && (!isTyped || isMultiGuess) && (minAnswers > 0 || maxAnswers !== undefined)}
    {@const noun = isTyped ? 'answer' : 'option'}
    <p class="text-xs text-slate-500">
      {#if minAnswers > 0 && maxAnswers !== undefined}
        {isTyped ? 'Give' : 'Select'} between {minAnswers} and {maxAnswers}
        {noun}{maxAnswers === 1 ? '' : 's'}.
      {:else if minAnswers > 0}
        {isTyped ? 'Give' : 'Select'} at least {minAnswers} {noun}{minAnswers === 1 ? '' : 's'}.
      {:else}
        {isTyped ? 'Give' : 'Select'} up to {maxAnswers} {noun}{maxAnswers === 1 ? '' : 's'}.
      {/if}
    </p>
  {/if}

  {#if standalone}
    <div class="flex justify-end">
      {#if !standaloneLocked}
        <button
          type="button"
          class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!canSubmit}
          onclick={submitAnswer}
        >
          Submit answer
        </button>
      {:else}
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onclick={reset}
        >
          <RotateCcw size={15} /> Try again
        </button>
      {/if}
    </div>
  {/if}
</div>
