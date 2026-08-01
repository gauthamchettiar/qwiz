<script lang="ts">
  import { fade } from 'svelte/transition';
  import {
    ChevronRight,
    ChevronLeft,
    RotateCcw,
    Trophy,
    ListChecks,
    Timer,
    Lightbulb
  } from '@lucide/svelte';
  import { parseQuizScriptQuestion, type QuizScriptQuestion } from '@/lib/utils/quizScript';
  import {
    blankDraft,
    buildPlayRun,
    draftFromAnswer,
    gradeDraft,
    gradeRun,
    isDraftComplete,
    questionMaxPoints,
    settingNumber,
    settingString,
    type AnswerRecord,
    type PlayQuestion,
    type QuestionDraft,
    type QuestionResult
  } from '@/lib/utils/grading';
  import type { Quiz } from '@/lib/schemas/quiz';
  import QuestionPlayer from './QuestionPlayer.svelte';
  import LeaveGuard from './LeaveGuard.svelte';

  let { quiz }: { quiz: Quiz } = $props();

  /** "M:SS" for any of this component's three countdowns — seconds alone would get unreadable
   * past a minute or two, which a `timer_seconds` easily is. */
  function formatSeconds(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

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
  const revealAnswersSetting = $derived(
    settingString(quiz.settings.reveal_answers, 'after_every_question')
  );
  const revealScoresSetting = $derived(
    settingString(quiz.settings.reveal_scores, 'after_every_question')
  );
  const showAnswersLive = $derived(revealAnswersSetting === 'after_every_question');
  const showScoresLive = $derived(revealScoresSetting === 'after_every_question');
  const showAnswersAtEnd = $derived(revealAnswersSetting !== 'never');
  const showScoresAtEnd = $derived(revealScoresSetting !== 'never');
  const locksAnswerImmediately = $derived(showAnswersLive || showScoresLive);

  // `show_running_score`: a persistent "earned / total" header visible throughout the run, independent of
  // reveal_scores — the total is always safe to show (a question's max never depends on how it's
  // answered, see `questionMaxPoints`), but the earned side would leak exactly what reveal_scores
  // is trying to hold back if shown for real outside `after_every_question`, so it's masked as "?"
  // there instead of just hiding the whole header. Defaults true — only an explicit `false` turns
  // it off (same "unset/anything else means on" convention `buildPlayRun` already uses for
  // `shuffle_questions`).
  const showScoreHeader = $derived(quiz.settings.show_running_score !== false);
  const totalMaxPoints = $derived(
    run.reduce((sum, playQuestion) => sum + questionMaxPoints(playQuestion.question), 0)
  );
  const earnedSoFar = $derived(results.reduce((sum, r) => sum + r.earned, 0));

  // `show_reveal_screen` (default true; forced true whenever `showAnswersLive`, since a
  // correctness reveal needs a real screen — see the parser's own validation): whether submitting
  // a question pauses on its locked reveal screen or skips straight to the next question. Only
  // ever relevant when `showScoresLive` and NOT `showAnswersLive` — that's the sole combination
  // where a live reveal exists but doesn't require a full screen, just a number.
  const showIntermediateScreen = $derived(quiz.settings.show_reveal_screen !== false);
  const skipIntermediateScreen = $derived(
    showScoresLive && !showAnswersLive && !showIntermediateScreen
  );

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

  function handleDraftChange(draft: QuestionDraft) {
    draftAnswers[currentIndex] = draft;
  }

  // `<QuestionPlayer>` is keyed on `currentIndex` alone (see the template) and owns its own
  // internal draft state once mounted — it never re-reads its `draft` prop after mount (see its
  // own doc comment on why). `on_timeout=lock_zero` grades a *different*, blank draft
  // than whatever QuestionPlayer's own internal state actually has selected, so without forcing a
  // remount, its reveal screen would keep showing the player's real (ignored-for-scoring)
  // selection instead of the "nothing, zero credit" this setting is supposed to display. Bumped
  // every commit — a no-op visually for the normal path (the remounted draft is identical, since
  // `draftAnswers[currentIndex]` was already kept live in sync via `handleDraftChange`), and the
  // fix for lock_zero.
  let questionResetNonce = $state(0);

  /** Grades `draft` against the current question and locks it in — shared by the manual Submit
   * button (which only ever calls this once `canSubmit` is true) and a per_question timer running
   * out (which calls this regardless of completeness, since a timeout means "stop waiting", not
   * "wait for a complete answer"). */
  function commitCurrentAnswer(draft: QuestionDraft) {
    if (!current || locked) return;
    draftAnswers[currentIndex] = draft;
    questionResetNonce += 1;
    const { result, answer } = gradeDraft(current.question, draft);
    results = [...results, result];
    answers = [...answers, answer];
    if (skipIntermediateScreen) {
      flashScore(result.earned);
      nextQuestion(); // straight on to the next question — no reveal screen to pause on
      return;
    }
    locked = true;
  }

  function submitAnswer() {
    if (!canSubmit) return;
    commitCurrentAnswer(currentDraft);
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
    const graded = run.map((playQuestion, i) =>
      gradeDraft(playQuestion.question, draftAnswers[i] ?? blankDraft())
    );
    results = graded.map((g) => g.result);
    answers = graded.map((g) => g.answer);
    finished = true;
  }

  // `timer_mode`/`timer_seconds`/`on_timeout`/`reveal_screen_seconds` — see
  // QUIZ_SETTING_RULES. `timer_mode=per_question` is only ever set alongside
  // `locksAnswerImmediately` (enforced at parse time — see quizScript.ts), so the per-question
  // timer effect below never needs to re-check that itself.
  const timerMode = $derived(settingString(quiz.settings.timer_mode, 'off'));
  const timerDuration = $derived(settingNumber(quiz.settings.timer_seconds));
  const timeoutAction = $derived(settingString(quiz.settings.on_timeout, 'auto_submit'));
  const intermediateScreenDuration = $derived(settingNumber(quiz.settings.reveal_screen_seconds));

  /** Grades whatever's currently on screen per `timeoutAction` (the real draft for "auto_submit",
   * a blank one for "lock_zero" — zero credit regardless of any partial selection/input) and locks
   * it in — called when a per_question timer, or a per_quiz timer with a question still live,
   * reaches zero. */
  function timeUpForCurrentQuestion() {
    commitCurrentAnswer(timeoutAction === 'lock_zero' ? blankDraft() : currentDraft);
  }

  /** A per_quiz timer running out ends the run immediately, wherever the player currently is. In
   * `locksAnswerImmediately` mode, the live
   * question (if any, and not already locked) is graded per `timeoutAction` first; any question
   * never even reached yet still needs a blank-graded entry so its max keeps counting toward the
   * run's total instead of silently shrinking it (not reaching a question isn't the same as it not
   * existing). In deferred ("reveal at end") mode there's no per-question lock concept at all —
   * every question just grades from whatever's in `draftAnswers`, identical to the manual "Submit
   * quiz" action. */
  function endRunDueToTimeout() {
    if (locksAnswerImmediately) {
      const finalResults = [...results];
      const finalAnswers = [...answers];
      if (current && !locked) {
        const draft = timeoutAction === 'lock_zero' ? blankDraft() : currentDraft;
        const { result, answer } = gradeDraft(current.question, draft);
        finalResults.push(result);
        finalAnswers.push(answer);
      }
      for (let i = finalResults.length; i < run.length; i++) {
        const { result, answer } = gradeDraft(run[i].question, blankDraft());
        finalResults.push(result);
        finalAnswers.push(answer);
      }
      results = finalResults;
      answers = finalAnswers;
    } else {
      const graded = run.map((playQuestion, i) =>
        gradeDraft(playQuestion.question, draftAnswers[i] ?? blankDraft())
      );
      results = graded.map((g) => g.result);
      answers = graded.map((g) => g.answer);
    }
    finished = true;
  }

  // Live countdown while a question is being answered under timer_mode=per_question — resets to
  // timerDuration every time a fresh question begins (`locked` flips back to false via
  // `nextQuestion`) and stops ticking the moment it locks (submitted, or timed out) or the run
  // finishes. `null` whenever this mode isn't active, so the template can tell "no timer" apart
  // from "timer at 0".
  let questionSecondsLeft = $state<number | null>(null);
  $effect(() => {
    if (timerMode !== 'per_question' || timerDuration === undefined || locked || finished) {
      questionSecondsLeft = null;
      return;
    }
    questionSecondsLeft = timerDuration;
    const interval = setInterval(() => {
      if (questionSecondsLeft === null) return;
      if (questionSecondsLeft <= 1) {
        questionSecondsLeft = 0;
        clearInterval(interval);
        timeUpForCurrentQuestion();
      } else {
        questionSecondsLeft -= 1;
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  // One continuous countdown for the whole run under timer_mode=per_quiz — deliberately NOT reset
  // per question (that's the entire point of a shared, quiz-wide budget); only resets when a new
  // run actually starts (`finished` flipping back to false via `playAgain`).
  let quizSecondsLeft = $state<number | null>(null);
  $effect(() => {
    if (timerMode !== 'per_quiz' || timerDuration === undefined || finished) {
      quizSecondsLeft = null;
      return;
    }
    quizSecondsLeft = timerDuration;
    const interval = setInterval(() => {
      if (quizSecondsLeft === null) return;
      if (quizSecondsLeft <= 1) {
        quizSecondsLeft = 0;
        clearInterval(interval);
        endRunDueToTimeout();
      } else {
        quizSecondsLeft -= 1;
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  // The post-answer reveal screen's own auto-advance countdown (reveal_screen_seconds) —
  // only ticks while genuinely showing that screen (`locked`, which is never true when
  // `skipIntermediateScreen` short-circuits straight past it) and calls the same `nextQuestion`
  // the button itself uses once it reaches zero, including on the last question (advancing to
  // results, exactly like clicking "See results" would).
  let intermediateSecondsLeft = $state<number | null>(null);
  $effect(() => {
    if (intermediateScreenDuration === undefined || !locked || finished) {
      intermediateSecondsLeft = null;
      return;
    }
    intermediateSecondsLeft = intermediateScreenDuration;
    const interval = setInterval(() => {
      if (intermediateSecondsLeft === null) return;
      if (intermediateSecondsLeft <= 1) {
        intermediateSecondsLeft = 0;
        clearInterval(interval);
        nextQuestion();
      } else {
        intermediateSecondsLeft -= 1;
      }
    }, 1000);
    return () => clearInterval(interval);
  });

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

<!-- The author's own "why" note for a question, shown once its answer is revealed — identical on
     the post-answer screen and the end-of-run Review screen, so it lives in one snippet. -->
{#snippet analysisNote(question: QuizScriptQuestion)}
  {#if question.analysis}
    <div class="rounded-md border border-dashed border-accent-line-faint bg-accent-surface p-3">
      <p class="flex items-center gap-1 text-xs font-medium text-accent-ink-strong">
        <Lightbulb size={13} />
        {question.analysis.label || 'Why?'}
      </p>
      <p class="mt-0.5 whitespace-pre-wrap text-sm text-ink">
        {question.analysis.content}
      </p>
    </div>
  {/if}
{/snippet}

<div class="space-y-6">
  {#if run.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      This quiz has no questions yet — nothing to play.
    </p>
  {:else if finished && summary && reviewing}
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink"
          onclick={() => (reviewing = false)}
        >
          <ChevronLeft size={15} /> Back to summary
        </button>
        {#if showScoresAtEnd}
          <p class="text-sm font-medium text-ink-subtle">{summary.earned} / {summary.max} points</p>
        {/if}
      </div>
      <!-- Each already-graded question is replayed through the very same `<QuestionPlayer>` that
           answered it — locked, seeded with the recorded answer via `draftFromAnswer` — rather
           than a parallel read-only renderer. A second renderer is what left every variant
           except choice/typed unrenderable here: it only ever knew those two answer shapes, so an
           order/match/group_items/fill_blanks/guess_letters answer reached it as a `selected`
           set that doesn't exist on those records. -->
      {#each run as playQuestion, i (i)}
        {@const answer = answers[i]}
        {#if answer}
          <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6">
            <p class="text-xs font-medium text-ink-subtle">Question {i + 1} of {run.length}</p>
            <QuestionPlayer
              question={playQuestion.question}
              {playQuestion}
              draft={draftFromAnswer(playQuestion.question, answer)}
              locked
              revealAnswers={showAnswersAtEnd}
              revealScores={showScoresAtEnd}
            />
          </div>
        {/if}
      {/each}
    </div>
  {:else if finished && summary}
    <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6 text-center">
      {#if showScoresAtEnd}
        <div class="flex justify-center">
          <div
            class="rounded-full p-3 {summary.won
              ? 'bg-positive-surface text-positive-ink-soft'
              : 'bg-surface-hover text-ink-faint'}"
          >
            <Trophy size={28} />
          </div>
        </div>
        <h2 class="text-xl font-bold text-ink">
          {summary.won ? 'You won!' : 'Quiz complete'}
        </h2>
        <p class="text-sm text-ink-subtle">
          {summary.earned} / {summary.max} points ({Math.round(summary.percentage)}%)
        </p>
        <div class="mx-auto max-w-xs space-y-1">
          {#each results as result, i (i)}
            <div class="flex items-center justify-between text-xs text-ink-subtle">
              <span>Question {i + 1}</span>
              <span>{result.earned} / {result.max}</span>
            </div>
          {/each}
        </div>
      {:else}
        <h2 class="text-xl font-bold text-ink">Quiz complete</h2>
      {/if}
      <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
        <a
          href="/"
          class="rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
        >
          Back to quizzes
        </a>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
          onclick={() => (reviewing = true)}
        >
          <ListChecks size={15} /> Review answers
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
          onclick={playAgain}
        >
          <RotateCcw size={15} /> Play again
        </button>
      </div>
    </div>
  {:else if current}
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <p class="text-xs font-medium text-ink-subtle">
            Question {currentIndex + 1} of {run.length}
          </p>
          {#if questionSecondsLeft !== null || quizSecondsLeft !== null}
            {@const secondsLeft = questionSecondsLeft ?? quizSecondsLeft ?? 0}
            <span
              class="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold {secondsLeft <=
              10
                ? 'bg-negative-surface-strong text-negative-ink-strong'
                : 'bg-surface-hover text-ink-soft'}"
            >
              <Timer size={11} />
              {formatSeconds(secondsLeft)}
            </span>
          {/if}
        </div>
        {#if showScoreHeader}
          <p class="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
            {#if scoreFlash}
              <span
                transition:fade={{ duration: 250 }}
                class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {scoreFlash.points > 0
                  ? 'bg-positive-surface-strong text-positive-ink'
                  : 'bg-surface-sunken text-ink-soft'}"
              >
                {scoreFlash.points > 0 ? '+' : ''}{scoreFlash.points}
              </span>
            {/if}
            Score: {showScoresLive ? earnedSoFar : '?'} / {totalMaxPoints}
          </p>
        {/if}
      </div>
      <div class="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          class="h-full bg-accent transition-all"
          style={`width: ${((currentIndex + (locksAnswerImmediately && locked ? 1 : 0)) / run.length) * 100}%`}
        ></div>
      </div>
    </div>

    <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6">
      {#key `${currentIndex}-${questionResetNonce}`}
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

      {#if locksAnswerImmediately && locked}
        {@render analysisNote(current.question)}
      {/if}

      <div class="flex items-center justify-between">
        {#if !locksAnswerImmediately}
          <button
            type="button"
            class="flex items-center gap-1 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
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
              class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-strong"
              disabled={!canSubmit}
              onclick={submitAnswer}
            >
              Submit answer
            </button>
          {:else}
            <div class="flex items-center gap-2">
              {#if intermediateSecondsLeft !== null}
                <span class="flex items-center gap-1 text-xs font-medium text-ink-subtle">
                  <Timer size={12} />
                  {formatSeconds(intermediateSecondsLeft)}
                </span>
              {/if}
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
                onclick={nextQuestion}
              >
                {isLast ? 'See results' : 'Next question'}
                <ChevronRight size={15} />
              </button>
            </div>
          {/if}
        {:else if isLast}
          {#if !confirmingSubmit}
            <button
              type="button"
              class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
              onclick={startConfirmSubmit}
            >
              Submit quiz
            </button>
          {:else}
            <button
              type="button"
              class="rounded-md bg-warning px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-warning-hover"
              onclick={confirmSubmitQuiz}
            >
              Are you sure? Submit quiz
            </button>
          {/if}
        {:else}
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
            onclick={() => goToQuestion(currentIndex + 1)}
          >
            Next question <ChevronRight size={15} />
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<!-- A run in progress is unsaved by construction — see LeaveGuard for what it intercepts. -->
<LeaveGuard
  active={!finished}
  title="Leave this quiz?"
  message="Your progress on this run won't be saved. Are you sure you want to leave?"
/>
