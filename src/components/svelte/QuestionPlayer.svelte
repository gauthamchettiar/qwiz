<script lang="ts">
  import { CircleCheck, CircleX, Eye, Plus, RotateCcw, X } from '@lucide/svelte';
  import type { QuizScriptOption, QuizScriptQuestion } from '@/lib/utils/quizScript';
  import {
    blankDraft,
    boxAnswer,
    buildPlayRun,
    gradeDraft,
    isDraftComplete,
    matchTypedGuesses,
    settingNumber,
    typedBoxCount,
    typedBoxGroups,
    typedSingleAnswerMatches,
    type PlayQuestion,
    type QuestionDraft
  } from '@/lib/utils/grading';
  import { extractYoutubeId } from '@/lib/utils/youtube';

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

  const seed = initialDraft ?? blankDraft();
  let selected = $state<Set<number>>(new Set(seed.selected));
  let revealedHints = $state<Set<number>>(new Set(seed.revealed));
  let typedSingleAnswer = $state(seed.typedSingleAnswer);
  let boxChars = $state<string[]>(seed.boxChars.length > 0 ? [...seed.boxChars] : runBoxChars());
  let typedGuesses = $state<string[]>([...seed.typedGuesses]);
  let typedGuessDraft = $state(seed.typedGuessDraft);
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
      typedGuessDraft
    };
  }

  // Fires on every change to any of the state read inside `currentDraft()` — the parent (in
  // embedded mode) uses this to persist the in-progress answer and to grade it once submitted.
  $effect(() => {
    onDraftChange?.(currentDraft());
  });

  const result = $derived(isLocked ? gradeDraft(question, currentDraft()).result : null);
  const canSubmit = $derived(isDraftComplete(question, currentDraft()));

  function optionsLayoutClass(): string {
    return question.settings.option_display === 'grid'
      ? question.options.length <= 4
        ? 'grid grid-cols-2 gap-2'
        : 'grid grid-cols-2 sm:grid-cols-3 gap-2'
      : 'space-y-2';
  }

  const minAnswers = $derived(settingNumber(question.settings.min_answers) ?? 0);
  const maxAnswers = $derived(settingNumber(question.settings.max_answers));
  const isSingleSelect = $derived(maxAnswers === 1);
  const isMultiGuess = $derived(isTyped && maxAnswers !== undefined && maxAnswers > 1);
  const isBoxes = $derived(isTyped && question.settings.input_display === 'boxes');
  const boxGroups = $derived(isBoxes ? typedBoxGroups(question) : []);
  const boxCount = $derived(isBoxes ? typedBoxCount(question) : 0);

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

  function revealHint(extraIndex: number) {
    if (isLocked || revealedHints.has(extraIndex)) return;
    revealedHints = new Set([...revealedHints, extraIndex]);
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
  }
</script>

{#snippet optionContent(content: QuizScriptOption['content'])}
  {#if content.kind === 'text'}
    <p class="text-sm text-slate-900">{content.text}</p>
  {:else if content.kind === 'image'}
    <img
      src={content.url}
      alt={content.alt}
      class="max-h-56 rounded-md border border-slate-200 object-contain"
    />
  {:else}
    {@const videoId = extractYoutubeId(content.url)}
    {#if videoId}
      <div class="aspect-video overflow-hidden rounded-md border border-slate-200">
        <iframe
          class="h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}`}
          title={content.alt || 'Video option'}
          allowfullscreen
        ></iframe>
      </div>
    {:else}
      <p class="text-sm text-slate-500">{content.alt || content.url}</p>
    {/if}
  {/if}
{/snippet}

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
  <p class="whitespace-pre-wrap text-base font-medium text-slate-900">{question.text}</p>

  {#each question.media as media, i (i)}
    {@render optionContent(media)}
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
  {:else}
    <div class={optionsLayoutClass()}>
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
            {@render optionContent(option.content)}
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
