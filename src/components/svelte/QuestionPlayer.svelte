<script lang="ts">
  import { CircleCheck, CircleX, Eye, Plus, RotateCcw, X } from '@lucide/svelte';
  import type { QuizScriptQuestion } from '@/lib/utils/quizScript';
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
    matchTypedGuesses,
    resolveExtraPrereveal,
    settingNumber,
    typedBoxCount,
    typedBoxGroups,
    typedSingleAnswerMatches,
    type PlayQuestion,
    type QuestionDraft
  } from '@/lib/utils/grading';
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
  const isTyped = $derived(question.variant === 'typed');
  const isCharacterInput = $derived(question.variant === 'character_input');
  const isOrder = $derived(question.variant === 'order');
  const isMatch = $derived(question.variant === 'match');
  const isCategorise = $derived(question.variant === 'categorise');
  const categoriseBucketLabels = $derived(isCategorise ? categoriseBuckets(question) : []);
  const isFillInBlanks = $derived(question.variant === 'fill_in_blanks');
  const fillInBlanksAnswers = $derived(isFillInBlanks ? fillInBlanksAnswerOptions(question) : []);
  const fillInBlanksMode = $derived(
    question.settings.blank_input === 'type' ? 'type' : ('bank' as const)
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
  // `extraPrerevealed` (prereveal_count's random extra positions) is resolved once here, at
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
  // categorise only: original option index -> bucket index into `categoriseBuckets(question)`.
  let categoriseAssignments = $state<Map<number, number>>(new Map(seed.categoriseAssignments));
  // fill_in_blanks only: one entry per blank, sized fresh (all-empty) unless a persisted draft
  // already has the right number — same pattern as `orderPlacement`/`runOrderPlacement` above.
  function runBlankAnswers(): string[] {
    return new Array(fillInBlanksAnswerOptions(question).length).fill('');
  }
  let blankAnswers = $state<string[]>(
    seed.blankAnswers.length === fillInBlanksAnswerOptions(question).length
      ? [...seed.blankAnswers]
      : runBlankAnswers()
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
      blankAnswers: [...blankAnswers]
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
  // Keyed off the variant itself (not `maxAnswers === 1`, the old proxy) — a single_choice
  // question always renders as a radio group regardless of whether it also sets max_answers, and
  // a multiple_choice question with max_answers=1 (a real, if unusual, thing to author) still
  // renders as checkboxes, since it's still a "pick from a set" question, just capped at one pick.
  const isSingleSelect = $derived(question.variant === 'single_choice');
  const isMultiGuess = $derived(isTyped && maxAnswers !== undefined && maxAnswers > 1);
  const isBoxes = $derived(isTyped && question.settings.input_display === 'boxes');
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
  // prereveal_count) and only grows from there: a letter that's entirely pre-revealed disables
  // from the very first render (nothing left for a click to do), and a correctly-guessed letter
  // disables once prereveal_mode has finished trickling out all its occurrences (immediately for
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
  // `input_display=boxes` mode, otherwise the plain text field. A fresh mount per question (see
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

  // order's tap-to-select-then-place interaction, entirely in terms of `orderPlacement`
  // (`(number|null)[]`, one slot per option, holding the original option index placed there) and
  // `picked` (the original option index currently "held," or `null`) — no drag events, so this is
  // native-keyboard-operable for free via plain `<button>` Tab/Enter, same as every other control
  // in this component.
  //
  // Clicking a bank item (one not currently in any slot) toggles it picked/unpicked. Clicking an
  // empty slot while something is picked places it there. Clicking an already-filled slot while
  // something is picked SWAPS: the picked item takes that slot, and whatever was already there
  // becomes the newly picked item (so it can immediately be placed elsewhere, or clicked again in
  // the bank to just set it back down). Clicking a filled slot while nothing is picked picks its
  // occupant back up, emptying that slot.
  function pickOrderItem(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  function clickOrderSlot(slotIndex: number) {
    if (isLocked) return;
    const occupant = orderPlacement[slotIndex];
    if (picked !== null) {
      const next = [...orderPlacement];
      const oldSlot = next.indexOf(picked);
      if (oldSlot !== -1) next[oldSlot] = null;
      next[slotIndex] = picked;
      orderPlacement = next;
      picked = occupant;
    } else if (occupant !== null) {
      const next = [...orderPlacement];
      next[slotIndex] = null;
      orderPlacement = next;
      picked = occupant;
    }
  }

  // match's tap-to-select-then-place interaction, in terms of `matchPairs` (left original option
  // index -> right original option index) and `picked` (the currently-held LEFT item). Clicking a
  // left item toggles it picked — if it was already paired, that pairing is dropped first so it
  // can be re-targeted. Clicking a right item while something's picked completes the pair,
  // stealing that right target away from whatever it was previously paired with (a right target
  // can only ever belong to one pair at a time). Clicking an already-paired right item with
  // nothing picked un-pairs it and picks its left item back up — same "click an occupied slot to
  // reclaim it" idea as order's board.
  function pickMatchLeft(leftIndex: number) {
    if (isLocked) return;
    if (picked === leftIndex) {
      picked = null;
      return;
    }
    matchPairs = new Map([...matchPairs].filter(([left]) => left !== leftIndex));
    picked = leftIndex;
  }

  function clickMatchRight(rightIndex: number) {
    if (isLocked) return;
    if (picked !== null) {
      const withoutStolen = [...matchPairs].filter(([, right]) => right !== rightIndex);
      matchPairs = new Map([...withoutStolen, [picked, rightIndex]]);
      picked = null;
      return;
    }
    const existingLeft = [...matchPairs].find(([, right]) => right === rightIndex)?.[0];
    if (existingLeft !== undefined) {
      matchPairs = new Map([...matchPairs].filter(([left]) => left !== existingLeft));
      picked = existingLeft;
    }
  }

  // categorise's tap-to-select-then-place interaction, in terms of `categoriseAssignments`
  // (option index -> bucket index) and `picked`. Unlike match, a bucket can hold several items at
  // once, so assigning to a bucket never has to evict anything already there.
  function pickCategoriseItem(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  function clickCategoriseBucket(bucketIndex: number) {
    if (isLocked || picked === null) return;
    const withoutPicked = [...categoriseAssignments].filter(([option]) => option !== picked);
    categoriseAssignments = new Map([...withoutPicked, [picked, bucketIndex]]);
    picked = null;
  }

  function pickCategoriseItemBackUp(optionIndex: number) {
    if (isLocked) return;
    categoriseAssignments = new Map(
      [...categoriseAssignments].filter(([option]) => option !== optionIndex)
    );
    picked = optionIndex;
  }

  // fill_in_blanks (blank_input=bank) tap-to-select-then-place interaction — `picked` (shared with
  // order/match/categorise above) holds the original option index of the currently-held bank word.
  function pickBankWord(optionIndex: number) {
    if (isLocked) return;
    picked = picked === optionIndex ? null : optionIndex;
  }

  function clickBlank(blankIndex: number) {
    if (isLocked) return;
    if (picked !== null) {
      const option = question.options[picked];
      const text = option.content.kind === 'text' ? option.content.text : '';
      const next = [...blankAnswers];
      next[blankIndex] = text;
      blankAnswers = next;
      picked = null;
      return;
    }
    if (!blankAnswers[blankIndex]) return;
    // Pick it back up — best-effort match a bank option by text (see FillInBlanksBoard's own
    // "Known limitation" doc comment on why this isn't index-exact for duplicate bank words).
    const text = blankAnswers[blankIndex];
    const match = question.options.findIndex(
      (o) => o.content.kind === 'text' && o.content.text === text
    );
    const next = [...blankAnswers];
    next[blankIndex] = '';
    blankAnswers = next;
    if (match !== -1) picked = match;
  }

  // fill_in_blanks (blank_input=type) — a plain per-blank text input, no picking involved.
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
  // correct but not fully revealed yet (`prereveal_mode=sequence`/`random` on a repeating letter) —
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
    // A fresh game re-rolls prereveal_count's random picks, same as a real Hangman round starting
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

<!-- character_input's answer display: one box per guessable letter (revealed/blank per
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
          class="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
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

  {#if isTyped}
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
    />
  {:else if isFillInBlanks}
    <FillInBlanksBoard
      text={question.text}
      options={question.options}
      bankOrder={pq.optionOrder}
      {blankAnswers}
      answerOptions={fillInBlanksAnswers}
      {picked}
      mode={fillInBlanksMode}
      locked={isLocked}
      revealAnswers={isLocked && revealAnswers}
      onPickBankWord={pickBankWord}
      onClickBlank={clickBlank}
      onTypeBlank={setBlankText}
    />
  {:else}
    <div class={choiceOptionsLayoutClass(question)}>
      {#each pq.optionOrder as optionIndex (optionIndex)}
        {@const option = question.options[optionIndex]}
        <label
          class="flex cursor-pointer items-start gap-2 rounded-md border p-3 transition-colors {selected.has(
            optionIndex
          )
            ? 'border-indigo-300 bg-indigo-50'
            : 'border-slate-200 hover:bg-slate-50'} {isLocked && revealAnswers
            ? option.correct
              ? 'border-green-400 bg-green-50'
              : selected.has(optionIndex)
                ? 'border-red-400 bg-red-50'
                : ''
            : ''}"
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

  {#if isLocked && revealScores && result}
    <p class="text-sm font-medium {result.earned > 0 ? 'text-green-700' : 'text-slate-500'}">
      {result.earned} / {result.max} points
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
