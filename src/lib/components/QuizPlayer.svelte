<script lang="ts">
  import { fade } from 'svelte/transition';
  import { CircleCheck, CircleX, Eye, ChevronRight, ChevronLeft, RotateCcw, Trophy, ListChecks } from '@lucide/svelte';
  import { parseQuizScriptQuestion, type QuizScriptOption, type QuizScriptQuestion } from '../quizScript';
  import {
    blankDraft,
    buildPlayRun,
    gradeDraft,
    gradeRun,
    isDraftComplete,
    matchTypedGuesses,
    questionMaxPoints,
    settingString,
    typedSingleAnswerMatches,
    type AnswerRecord,
    type PlayQuestion,
    type QuestionDraft,
    type QuestionResult
  } from '../grading';
  import { extractYoutubeId } from '../youtube';
  import type { Quiz } from '../types';
  import QuestionPlayer from './QuestionPlayer.svelte';

  let { quiz }: { quiz: Quiz } = $props();

  function startNewRun(): PlayQuestion[] {
    const parsed = quiz.questions.map((q) => parseQuizScriptQuestion(q.code).question);
    return buildPlayRun(parsed, quiz.settings);
  }

  // `reveal_answers`/`reveal_scores` (quiz-wide, default "after_every_question" — see
  // QUIZ_SETTING_RULES) independently control WHAT gets shown and WHEN, checked fresh at every
  // point something might be revealed rather than baked into one mode flag:
  // - `showXLive` gates the live, per-question view right after that question is answered.
  // - `showXAtEnd` gates the end-of-quiz review/summary.
  // `locksAnswerImmediately` is the one derived *navigation* decision: if EITHER setting is
  // "after_every_question", answering a question reveals something about it immediately, so that
  // question is locked in on the spot (matching this app's original behavior) and there's no going
  // back — letting the player revisit it after seeing a reveal would be retroactively informative
  // in a way "at_end"/"never" are specifically designed to prevent. Only when NEITHER setting
  // reveals anything live is it safe to let the player move freely between questions and submit
  // once at the end (with a confirmation, since that's the point of no return for the whole run).
  const revealAnswersSetting = $derived(settingString(quiz.settings.reveal_answers, 'after_every_question'));
  const revealScoresSetting = $derived(settingString(quiz.settings.reveal_scores, 'after_every_question'));
  const showAnswersLive = $derived(revealAnswersSetting === 'after_every_question');
  const showScoresLive = $derived(revealScoresSetting === 'after_every_question');
  const showAnswersAtEnd = $derived(revealAnswersSetting !== 'never');
  const showScoresAtEnd = $derived(revealScoresSetting !== 'never');
  const locksAnswerImmediately = $derived(showAnswersLive || showScoresLive);

  // `show_score`: a persistent "earned / total" header visible throughout the run, independent of
  // reveal_scores — the total is always safe to show (a question's max never depends on how it's
  // answered, see `questionMaxPoints`), but the earned side would leak exactly what reveal_scores
  // is trying to hold back if shown for real outside `after_every_question`, so it's masked as "?"
  // there instead of just hiding the whole header. Defaults true — only an explicit `false` turns
  // it off (same "unset/anything else means on" convention `buildPlayRun` already uses for
  // `shuffle_questions`).
  const showScoreHeader = $derived(quiz.settings.show_score !== false);
  const totalMaxPoints = $derived(run.reduce((sum, playQuestion) => sum + questionMaxPoints(playQuestion.question), 0));
  const earnedSoFar = $derived(results.reduce((sum, r) => sum + r.earned, 0));

  // `show_intermediate_screen` (default true; forced true whenever `showAnswersLive`, since a
  // correctness reveal needs a real screen — see the parser's own validation): whether submitting
  // a question pauses on its locked reveal screen or skips straight to the next question. Only
  // ever relevant when `showScoresLive` and NOT `showAnswersLive` — that's the sole combination
  // where a live reveal exists but doesn't require a full screen, just a number.
  const showIntermediateScreen = $derived(quiz.settings.show_intermediate_screen !== false);
  const skipIntermediateScreen = $derived(showScoresLive && !showAnswersLive && !showIntermediateScreen);

  // The brief "+N" (or "0"/"-N") badge shown next to the persistent score header when
  // `skipIntermediateScreen` bypasses the usual per-question reveal screen — otherwise the player
  // would get no feedback at all for that question before landing on the next one.
  let scoreFlash = $state<{ points: number } | null>(null);
  let scoreFlashTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(scoreFlashTimeout));

  function flashScore(points: number) {
    clearTimeout(scoreFlashTimeout);
    scoreFlash = { points };
    scoreFlashTimeout = setTimeout(() => (scoreFlash = null), 3000);
  }

  let run = $state(startNewRun());
  let currentIndex = $state(0);
  // One slot per question, continuously kept in sync with whatever `<QuestionPlayer>` reports via
  // `onDraftChange` — the single source of truth for "what has the player entered for question i
  // so far", whether or not it's been graded yet. In "reveal at the end" mode this is what makes
  // going Back and Next preserve answers instead of losing them; in immediate mode it's simply
  // read once, at Submit.
  let draftAnswers = $state<QuestionDraft[]>(run.map(() => blankDraft()));
  // Only meaningful when `locksAnswerImmediately` — the current question's submit/reveal state.
  // Deferred mode never sets this; nothing is locked per-question there, only the whole run at
  // once (see `confirmSubmitQuiz`).
  let locked = $state(false);
  let results = $state<QuestionResult[]>([]);
  // What the player actually answered/revealed for each already-graded question, in run order —
  // populated one at a time (immediate mode, as each question locks) or all at once (deferred
  // mode, at the final submit) — either way, this is what the end-of-quiz Review screen renders.
  let answers = $state<AnswerRecord[]>([]);
  let finished = $state(false);
  let reviewing = $state(false);

  // Same "click once, then click a distinct confirm button within a few seconds, or it silently
  // reverts" pattern ConfirmDeleteButton uses — deferred mode's final Submit is the one point of
  // no return in the whole run (everything grades and reveals at once), so it gets the same
  // "are you sure" gesture a destructive action would, just styled as a primary action instead.
  let confirmingSubmit = $state(false);
  let confirmSubmitTimeout: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(confirmSubmitTimeout));

  const current = $derived(run[currentIndex]);
  const isLast = $derived(currentIndex === run.length - 1);
  const currentDraft = $derived(draftAnswers[currentIndex] ?? blankDraft());
  const canSubmit = $derived(current ? isDraftComplete(current.question, currentDraft) : false);

  // Same auto-grid-vs-list rule QuestionView uses in the authoring form, so a quiz plays back
  // laid out the same way it was authored. A plain function (not a $derived off `current`) since
  // the Review screen needs this per-question for every question in the run, not just the live one.
  function optionsLayoutClass(question: QuizScriptQuestion): string {
    return question.settings.option_display === 'grid'
      ? question.options.length <= 4
        ? 'grid grid-cols-2 gap-2'
        : 'grid grid-cols-2 sm:grid-cols-3 gap-2'
      : 'space-y-2';
  }

  function handleDraftChange(draft: QuestionDraft) {
    draftAnswers[currentIndex] = draft;
  }

  function submitAnswer() {
    if (!current || locked || !canSubmit) return;
    const { result, answer } = gradeDraft(current.question, currentDraft);
    results = [...results, result];
    answers = [...answers, answer];
    if (skipIntermediateScreen) {
      flashScore(result.earned);
      nextQuestion(); // straight on to the next question — no reveal screen to pause on
      return;
    }
    locked = true;
  }

  function nextQuestion() {
    if (isLast) {
      finished = true;
      return;
    }
    currentIndex += 1;
    locked = false;
  }

  /** Deferred-mode ("reveal at the end") navigation — nothing is graded or locked here, just a
   * change of which question is on screen; `draftAnswers` already holds whatever's been entered
   * for every question visited so far, kept live by `handleDraftChange`. */
  function goToQuestion(index: number) {
    if (index < 0 || index >= run.length) return;
    currentIndex = index;
  }

  function startConfirmSubmit() {
    confirmingSubmit = true;
    clearTimeout(confirmSubmitTimeout);
    confirmSubmitTimeout = setTimeout(() => (confirmingSubmit = false), 5000);
  }

  /** The one deferred-mode "submit the whole run" action — every question gets graded at once
   * from whatever's sitting in `draftAnswers` (including ones the player never actually visited,
   * which just grade as blank), and only then does anything become visible per `showAnswersAtEnd`
   * / `showScoresAtEnd`. */
  function confirmSubmitQuiz() {
    clearTimeout(confirmSubmitTimeout);
    confirmingSubmit = false;
    const graded = run.map((playQuestion, i) => gradeDraft(playQuestion.question, draftAnswers[i] ?? blankDraft()));
    results = graded.map((g) => g.result);
    answers = graded.map((g) => g.answer);
    finished = true;
  }

  function playAgain() {
    run = startNewRun();
    currentIndex = 0;
    draftAnswers = run.map(() => blankDraft());
    locked = false;
    results = [];
    answers = [];
    finished = false;
    reviewing = false;
    confirmingSubmit = false;
    clearTimeout(confirmSubmitTimeout);
  }

  const summary = $derived(finished ? gradeRun(results, quiz.settings) : null);
</script>

{#snippet optionContent(content: QuizScriptOption['content'])}
  {#if content.kind === 'text'}
    <p class="text-sm text-slate-900">{content.text}</p>
  {:else if content.kind === 'image'}
    <img src={content.url} alt={content.alt} class="max-h-56 rounded-md border border-slate-200 object-contain" />
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

<!-- Always the question's own authored order, in a fixed wrapped-chip layout — `option_display`
     and `shuffle` don't apply to typed questions (see quizScript.ts's CHOICE_ONLY_SETTINGS), so
     unlike choice's own option rendering, there's no per-question layout or order to honor here. -->
{#snippet typedAcceptedAnswers(q: QuizScriptQuestion)}
  <div class="mt-2">
    <p class="text-xs font-medium text-slate-400">Accepted answers</p>
    <div class="mt-1 flex flex-wrap gap-1.5">
      {#each q.options as option, i (i)}
        {#if option.content.kind === 'text'}
          <span class="rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            {option.content.text}
          </span>
        {/if}
      {/each}
    </div>
  </div>
{/snippet}

{#snippet typedAnswerReview(q: QuizScriptQuestion, response: string | string[])}
  {#if typeof response === 'string'}
    {@const matched = typedSingleAnswerMatches(q.options, response, q.settings)}
    <div class="rounded-md border p-3 {matched !== null ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}">
      <p class="flex items-center gap-1.5 text-sm text-slate-900">
        {#if matched !== null}<CircleCheck size={14} class="shrink-0 text-green-600" />{:else}<CircleX size={14} class="shrink-0 text-red-500" />{/if}
        {response.trim() || '(left blank)'}
      </p>
    </div>
  {:else}
    {@const { perGuess } = matchTypedGuesses(q.options, response, q.settings)}
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
  {@render typedAcceptedAnswers(q)}
{/snippet}

<!-- Review counterpart of QuestionPlayer's `typedLockedNeutral` — the player's own response(s),
     no correctness marking, no accepted-answer list (reveal_answers=never). -->
{#snippet typedReviewNeutral(response: string | string[])}
  <div class="rounded-md border border-slate-200 bg-slate-50 p-3">
    {#if typeof response === 'string'}
      <p class="text-sm text-slate-700">{response.trim() || '(left blank)'}</p>
    {:else}
      <div class="flex flex-wrap gap-1.5">
        {#each response as guess, i (i)}
          <span class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
            {guess.trim() || '(blank)'}
          </span>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<!-- Read-only recap of one already-graded question: its text/media, every hint (revealed or
     not), and either every option or the typed answer(s) vs the accepted-answer list — correctness
     marking and the points line each independently gated on `showAnswersAtEnd`/`showScoresAtEnd`.
     Used once per question on the end-of-quiz Review screen. -->
{#snippet questionReview(playQuestion: PlayQuestion, answer: AnswerRecord, result: QuestionResult)}
  {@const q = playQuestion.question}
  <p class="whitespace-pre-wrap text-base font-medium text-slate-900">{q.text}</p>

  {#each q.media as media, i (i)}
    {@render optionContent(media)}
  {/each}

  {#each q.extras as extra, i (i)}
    <div class="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
      {#if answer.revealed.has(i)}
        <p class="flex items-center gap-1 text-xs font-medium text-slate-500"><Eye size={12} /> {extra.label || 'Hint'}</p>
        <p class="mt-1 text-sm text-slate-700">{extra.content}</p>
      {:else}
        <p class="flex items-center gap-1.5 text-sm text-slate-400"><Eye size={14} /> {extra.label || 'Hint'} (not revealed)</p>
      {/if}
    </div>
  {/each}

  {#if answer.kind === 'typed'}
    {#if showAnswersAtEnd}
      {@render typedAnswerReview(q, answer.response)}
    {:else}
      {@render typedReviewNeutral(answer.response)}
    {/if}
  {:else}
    <div class={optionsLayoutClass(q)}>
      {#each playQuestion.optionOrder as optionIndex (optionIndex)}
        {@const option = q.options[optionIndex]}
        <div
          class="flex items-start gap-2 rounded-md border p-3 {showAnswersAtEnd
            ? option.correct
              ? 'border-green-400 bg-green-50'
              : answer.selected.has(optionIndex)
                ? 'border-red-400 bg-red-50'
                : 'border-slate-200'
            : answer.selected.has(optionIndex)
              ? 'border-indigo-300 bg-indigo-50'
              : 'border-slate-200'}"
        >
          <div class="min-w-0 flex-1">
            {@render optionContent(option.content)}
            {#if answer.selected.has(optionIndex)}
              <p class="mt-0.5 text-xs font-medium text-slate-500">Your answer</p>
            {/if}
          </div>
          {#if showAnswersAtEnd}
            {#if option.correct}
              <CircleCheck size={16} class="mt-1 shrink-0 text-green-600" />
            {:else if answer.selected.has(optionIndex)}
              <CircleX size={16} class="mt-1 shrink-0 text-red-500" />
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  {#if showScoresAtEnd}
    <p class="text-sm font-medium {result.earned > 0 ? 'text-green-700' : 'text-slate-500'}">
      {result.earned} / {result.max} points
    </p>
  {/if}
{/snippet}

<div class="space-y-6">
  {#if run.length === 0}
    <p class="rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
      This quiz has no questions yet — nothing to play.
    </p>
  {:else if finished && summary && reviewing}
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          onclick={() => (reviewing = false)}
        >
          <ChevronLeft size={15} /> Back to summary
        </button>
        {#if showScoresAtEnd}
          <p class="text-sm font-medium text-slate-500">{summary.earned} / {summary.max} points</p>
        {/if}
      </div>
      {#each run as playQuestion, i (i)}
        <div class="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
          <p class="text-xs font-medium text-slate-400">Question {i + 1} of {run.length}</p>
          {@render questionReview(playQuestion, answers[i], results[i])}
        </div>
      {/each}
    </div>
  {:else if finished && summary}
    <div class="space-y-4 rounded-lg border border-slate-200 bg-white p-6 text-center">
      {#if showScoresAtEnd}
        <div class="flex justify-center">
          <div class="rounded-full p-3 {summary.won ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-400'}">
            <Trophy size={28} />
          </div>
        </div>
        <h2 class="text-xl font-bold text-slate-900">{summary.won ? 'You won!' : 'Quiz complete'}</h2>
        <p class="text-sm text-slate-500">
          {summary.earned} / {summary.max} points ({Math.round(summary.percentage)}%)
        </p>
        <div class="mx-auto max-w-xs space-y-1">
          {#each results as result, i (i)}
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span>Question {i + 1}</span>
              <span>{result.earned} / {result.max}</span>
            </div>
          {/each}
        </div>
      {:else}
        <h2 class="text-xl font-bold text-slate-900">Quiz complete</h2>
      {/if}
      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <a href="/" class="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Back to quizzes
        </a>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onclick={() => (reviewing = true)}
        >
          <ListChecks size={15} /> Review answers
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          onclick={playAgain}
        >
          <RotateCcw size={15} /> Play again
        </button>
      </div>
    </div>
  {:else if current}
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs font-medium text-slate-400">Question {currentIndex + 1} of {run.length}</p>
        {#if showScoreHeader}
          <p class="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            {#if scoreFlash}
              <span
                transition:fade={{ duration: 250 }}
                class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {scoreFlash.points > 0
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-200 text-slate-600'}"
              >
                {scoreFlash.points > 0 ? '+' : ''}{scoreFlash.points}
              </span>
            {/if}
            Score: {showScoresLive ? earnedSoFar : '?'} / {totalMaxPoints}
          </p>
        {/if}
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-full bg-indigo-600 transition-all"
          style={`width: ${((currentIndex + (locksAnswerImmediately && locked ? 1 : 0)) / run.length) * 100}%`}
        ></div>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      {#key currentIndex}
        <QuestionPlayer
          question={current.question}
          playQuestion={current}
          draft={draftAnswers[currentIndex]}
          locked={locksAnswerImmediately && locked}
          revealAnswers={showAnswersLive}
          revealScores={showScoresLive}
          onDraftChange={handleDraftChange}
        />
      {/key}

      <div class="flex items-center justify-between">
        {#if !locksAnswerImmediately}
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={currentIndex === 0}
            onclick={() => goToQuestion(currentIndex - 1)}
          >
            <ChevronLeft size={15} /> Back
          </button>
        {:else}
          <span></span>
        {/if}

        {#if locksAnswerImmediately}
          {#if !locked}
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
              class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              onclick={nextQuestion}
            >
              {isLast ? 'See results' : 'Next question'} <ChevronRight size={15} />
            </button>
          {/if}
        {:else if isLast}
          {#if !confirmingSubmit}
            <button
              type="button"
              class="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              onclick={startConfirmSubmit}
            >
              Submit quiz
            </button>
          {:else}
            <button
              type="button"
              class="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              onclick={confirmSubmitQuiz}
            >
              Are you sure? Submit quiz
            </button>
          {/if}
        {:else}
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            onclick={() => goToQuestion(currentIndex + 1)}
          >
            Next question <ChevronRight size={15} />
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>
