<script lang="ts">
  import { fade } from 'svelte/transition';
  import {
    AlarmClock,
    ArrowLeftRight,
    BookmarkPlus,
    Check,
    ChevronRight,
    ChevronLeft,
    CircleCheck,
    CircleMinus,
    Coins,
    Eye,
    EyeOff,
    FastForward,
    Lock,
    Palette,
    Play,
    RotateCcw,
    Shuffle,
    SkipForward,
    Trophy,
    ListChecks,
    Timer,
    Lightbulb
  } from '@lucide/svelte';
  import { applyThemeCss, clearThemeCss } from '@/lib/stores/theme';
  import { quizTheme } from '@/lib/stores/quizTheme.svelte';
  import { needsThemeDecision, resolveThemeCss, type ThemeTrust } from '@/lib/utils/themeCss';
  import { playPresetCss } from '@/lib/themes/playPresets';
  import { parseQuizScriptQuestion, type QuizScriptQuestion } from '@/lib/utils/quizScript';
  import {
    blankDraft,
    buildPlayRun,
    draftFromAnswer,
    gradeDraft,
    gradeRun,
    canSubmitDraft,
    isAnswerEmpty,
    locksOnSubmit,
    questionMaxPoints,
    settingNumber,
    settingString,
    type AnswerRecord,
    type PlayQuestion,
    type QuestionDraft,
    type QuestionResult
  } from '@/lib/utils/grading';
  import { buildQuizRules, type QuizRuleIcon } from '@/lib/utils/quizRules';
  import { importQwizSource } from '@/lib/utils/importQwiz';
  import type { Quiz } from '@/lib/schemas/quiz';
  import QuestionPlayer from './QuestionPlayer.svelte';
  import LeaveGuard from './LeaveGuard.svelte';
  import Button from './Button.svelte';
  import ErrorList from './ErrorList.svelte';

  // `saveCopySource` is set only by the shared-link player (SharedQuizPlayPage): the `.qwiz`
  // document this run was decoded from, so the player can opt into keeping it. Absent for a quiz
  // that's already in this browser's library, where "save a copy" would just make a duplicate.
  let {
    quiz,
    saveCopySource,
    onTrustChange
  }: {
    quiz: Quiz;
    saveCopySource?: string;
    /** Fires when the player answers the theme prompt, so a SAVED quiz can remember the answer and
     * stop asking. Absent for a quiz that isn't in this browser's library (a share link, a gist) —
     * there's nothing to remember it on, so the answer lasts the run. */
    onTrustChange?: (trust: ThemeTrust) => void;
  } = $props();

  // A quiz's own look, applied for the duration of the run and taken away again on the way out —
  // a theme is something you pass through, never something a quiz leaves behind on the app.
  //
  // `trust` starts from what the quiz already carries: `full` for one authored in this browser
  // (see QuizBuilder), unset for anything that arrived from elsewhere, which is what makes the
  // prompt appear for exactly the quizzes it should.
  let trust = $state<ThemeTrust | undefined>(quiz.themeTrust);
  const askAboutTheme = $derived(needsThemeDecision(quiz.themeCss, trust));

  $effect(() => {
    const css = resolveThemeCss(playPresetCss(quiz.themePreset), quiz.themeCss, trust);
    // `quizTheme.active` is set on BOTH paths, not just when something is applied: a player who
    // skipped the author's CSS, or a quiz whose look resolved to nothing, must get their theme
    // picker back rather than have it stay disabled for the rest of the run.
    if (css === null) {
      quizTheme.active = false;
      return;
    }
    applyThemeCss(css);
    quizTheme.active = true;
    return () => {
      clearThemeCss();
      quizTheme.active = false;
    };
  });

  function decideTrust(next: ThemeTrust) {
    trust = next;
    onTrustChange?.(next);
  }

  let saved = $state(false);
  let saveErrors = $state<string[]>([]);

  function saveCopy() {
    if (!saveCopySource || saved) return;
    saveErrors = [];
    // Checks the result rather than assuming the write landed — a save that silently didn't
    // happen is worse than one that visibly failed.
    const { quiz: savedQuiz, errors } = importQwizSource(saveCopySource);
    if (!savedQuiz) {
      saveErrors = errors;
      return;
    }
    saved = true;
  }

  /** Rule icon names → components. Lives here rather than in `quizRules.ts` because that module is
   * framework-free (CLAUDE.md §3) and can't import from `@lucide/svelte`. Typed as a full
   * `Record`, so adding a `QuizRuleIcon` without a component is a compile error rather than a
   * silently blank bullet. */
  const RULE_ICONS: Record<QuizRuleIcon, typeof Timer> = {
    list: ListChecks,
    shuffle: Shuffle,
    lock: Lock,
    navigate: ArrowLeftRight,
    required: CircleCheck,
    skip: SkipForward,
    timer: Timer,
    alarm: AlarmClock,
    eye: Eye,
    'eye-off': EyeOff,
    'fast-forward': FastForward,
    points: Coins,
    penalty: CircleMinus,
    trophy: Trophy
  };

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
  // Same decision as `showAnswersLive || showScoresLive`, but read from `locksOnSubmit` so the
  // welcome screen's rules list can describe this navigation model from the identical predicate.
  const locksAnswerImmediately = $derived(locksOnSubmit(quiz.settings));

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
  // The welcome screen is a real phase, not a hidden run: nothing may tick before the player has
  // read the rules and chosen to begin. Both timer effects below and the LeaveGuard at the bottom
  // hang off this — a player still reading the rules has no clock running and nothing to lose.
  let started = $state(false);
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
  const canSubmit = $derived(current ? canSubmitDraft(current.question, currentDraft) : false);

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
    if (
      !started ||
      timerMode !== 'per_question' ||
      timerDuration === undefined ||
      locked ||
      finished
    ) {
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
    if (!started || timerMode !== 'per_quiz' || timerDuration === undefined || finished) {
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

  function startRun() {
    started = true;
  }

  // `started` deliberately stays true here: "Play again" means play, and none of the rules changed
  // in the meantime — including under questions_per_run, where the rule describes the *sampling*,
  // not the sample. It also keeps the per-quiz timer's reset semantics above literally intact,
  // rather than moving a second run's clock start onto a Start click.
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

  function plural(count: number, word: string): string {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
  }

  /** One class string per outcome, never two layered — which of `bg-positive-surface` and
   * `bg-surface-hover` wins is decided by their order in the generated stylesheet, not by the
   * order they're written (CLAUDE.md §5). */
  function questionChipTone(result: QuestionResult, skipped: boolean): string {
    if (skipped) return 'bg-surface-hover text-ink-subtle';
    if (result.max === 0) return 'bg-surface-hover text-ink-subtle';
    if (result.earned >= result.max) return 'bg-positive-surface text-positive-ink-strong';
    if (result.earned > 0) return 'bg-warning-surface text-warning-ink-strong';
    return 'bg-negative-surface text-negative-ink-strong';
  }

  // Read only by the welcome screen; $derived is lazy, so it costs nothing once the run is under
  // way. Built from `run` rather than `quiz.questions` so that questions_per_run's sampling and
  // the quiz-wide setting inheritance `buildPlayRun` performs are already reflected in the count,
  // the points total and every per-question rule.
  const rules = $derived(
    buildQuizRules(
      run.map((playQuestion) => playQuestion.question),
      quiz.settings,
      quiz.questions.length
    )
  );
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

<!-- Only ever rendered for a quiz that arrived by link (see `saveCopySource`) — offered on the way
     in and again on the way out, since "I want to keep this" happens both before and after
     playing. Disabled once it lands rather than hidden, so a second press can't mint a duplicate
     and the confirmation stays where the button was. -->
{#snippet saveCopyAction()}
  {#if saveCopySource}
    <Button onclick={saveCopy} disabled={saved}>
      {#if saved}
        <Check size={15} /> Saved to your quizzes
      {:else}
        <BookmarkPlus size={15} /> Save a copy
      {/if}
    </Button>
  {/if}
{/snippet}

<div class="space-y-6">
  {#if run.length === 0}
    <p class="rounded-lg border border-line-subtle p-6 text-center text-sm text-ink-subtle">
      This quiz has no questions yet — nothing to play.
    </p>
    <!-- The entry phase for every run. Deliberately after the empty-quiz branch (a quiz with
         nothing in it shouldn't offer a Start button over an empty run) and before the two
         `finished` ones — `finished` can't be true while `!started`, so that ordering is purely a
         statement of intent, and it's what makes a future "back to the rules" affordance a
         one-line change. No transition: the timer specs run under a faked rAF clock, and 200ms of
         polish isn't worth risking them on. -->
  {:else if !started}
    <div class="qwiz-welcome space-y-6 rounded-lg border border-line-subtle bg-surface-raised p-6">
      <div class="space-y-2">
        <h1 class="qwiz-title text-2xl font-bold text-ink">{quiz.title}</h1>
        {#if quiz.description}
          <p class="qwiz-description whitespace-pre-wrap text-sm text-ink-subtle">
            {quiz.description}
          </p>
        {/if}
      </div>

      <div class="space-y-2">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
          How this quiz works
        </h2>
        <ul class="qwiz-rules space-y-2">
          {#each rules as rule (rule.id)}
            {@const Icon = RULE_ICONS[rule.icon]}
            <li class="flex items-start gap-2 text-sm text-ink-muted">
              <Icon size={15} class="mt-0.5 shrink-0 text-ink-subtle" />
              <span>{rule.text}</span>
            </li>
          {/each}
        </ul>
      </div>

      {#if askAboutTheme}
        <!-- Asked about, not applied. The quiz's PRESET is already on by the time this renders —
             a preset is this app's own stylesheet, named by the file rather than carried in it, so
             there's nothing in it to distrust. This is only ever about the CSS the author wrote
             themselves, which is arbitrary code running in this page.
             Two choices, not three: a "colours only" middle ground made sense when a theme was 53
             colour tokens, but a stylesheet that also moves things would come out half-applied and
             look broken rather than safe. A quiz you wrote yourself never reaches here — see
             `themeTrust` in QuizBuilder. -->
        <div
          class="qwiz-trust space-y-3 rounded-lg border border-warning-line bg-warning-surface p-4"
        >
          <div class="flex items-start gap-2">
            <Palette size={16} class="mt-0.5 shrink-0 text-warning-ink-strong" />
            <div>
              <p class="text-sm font-medium text-ink">This quiz brings its own styling.</p>
              <p class="mt-0.5 text-sm text-ink-muted">
                The author's CSS can change anything on this page. Only allow it if you trust them.
              </p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <Button size="sm" onclick={() => decideTrust('full')}>Allow it</Button>
            <Button variant="primary" size="sm" onclick={() => decideTrust('none')}>Skip it</Button>
          </div>
        </div>
      {/if}

      <div class="flex flex-wrap items-center gap-2">
        <Button variant="primary" class="qwiz-start" onclick={startRun}>
          <Play size={15} /> Start quiz
        </Button>
        {@render saveCopyAction()}
      </div>
      <ErrorList errors={saveErrors} />
    </div>
  {:else if finished && summary && reviewing}
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3">
        <button
          type="button"
          class="qwiz-back-to-summary flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink"
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
          <div
            class="qwiz-card qwiz-review space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6"
          >
            <p class="qwiz-progress text-xs font-medium text-ink-subtle">
              Question {i + 1} of {run.length}
            </p>
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
    <!-- The result, as one composed card rather than a stack of centred paragraphs: a score dial
         carrying the verdict, then the per-question breakdown as a grid of chips. The old layout
         put four separate lines of centred text above a list of "Question N   1 / 1" rows, which
         read as a receipt and buried the one number anyone came for. -->
    <div
      class="qwiz-results overflow-hidden rounded-xl border border-line-subtle bg-surface-raised"
    >
      {#if showScoresAtEnd}
        <div
          class="qwiz-results-head flex flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:gap-6 sm:text-left {summary.won
            ? 'bg-positive-surface'
            : 'bg-surface-hover'}"
        >
          <!-- A ring rather than a bar: the reading is "how much of it did I get", and a circle
               shows a proportion without needing a scale to compare against. -->
          <div
            class="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
            style={`background: conic-gradient(currentColor ${Math.round(summary.percentage) * 3.6}deg, transparent 0deg)`}
            class:text-positive-ink={summary.won}
            class:text-accent={!summary.won}
          >
            <div
              class="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full {summary.won
                ? 'bg-positive-surface'
                : 'bg-surface-hover'}"
            >
              <span class="qwiz-results-percent text-xl font-bold text-ink"
                >{Math.round(summary.percentage)}%</span
              >
            </div>
          </div>

          <div class="space-y-1">
            <!-- A real heading, not styled text: it's the outcome of the whole run, and it's what
                 a screen reader should land on when the results appear. -->
            <h2
              class="qwiz-results-title flex items-center justify-center gap-1.5 text-lg font-bold sm:justify-start {summary.won
                ? 'text-positive-ink-strong'
                : 'text-ink'}"
            >
              {#if summary.won}
                <Trophy size={18} />
              {/if}
              {summary.won ? 'You won!' : 'Quiz complete'}
            </h2>
            <p class="text-sm text-ink-subtle">
              {summary.earned} of {summary.max} points across {plural(results.length, 'question')}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap justify-center gap-1.5 px-6 py-4 sm:justify-start">
          {#each results as result, i (i)}
            {@const answer = answers[i]}
            {@const wasSkipped =
              answer !== undefined &&
              run[i] !== undefined &&
              isAnswerEmpty(run[i].question, answer)}
            <!-- One chip per question, coloured by outcome. A skipped question and a wrong one
                 both score 0, so the number alone can't tell them apart — which is the single
                 most useful thing this breakdown can say. -->
            <span
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium {questionChipTone(
                result,
                wasSkipped
              )}"
              title={wasSkipped ? 'Skipped' : `${result.earned} / ${result.max} points`}
            >
              <span class="opacity-70">{i + 1}</span>
              {wasSkipped ? 'Skipped' : `${result.earned}/${result.max}`}
            </span>
          {/each}
        </div>
      {:else}
        <div class="px-6 py-8 text-center">
          <h2 class="text-lg font-bold text-ink">Quiz complete</h2>
        </div>
      {/if}

      <!-- No "Back to quizzes" here: the header already carries a Back link, and two ways out of
           the same screen only makes the one that matters harder to find. -->
      <div
        class="flex flex-wrap items-center justify-center gap-2 border-t border-line-faint px-6 py-4"
      >
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-hover"
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
        {@render saveCopyAction()}
      </div>
      <ErrorList errors={saveErrors} />
    </div>
  {:else if current}
    <div class="space-y-1">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <p class="qwiz-progress text-xs font-medium text-ink-subtle">
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
          <p class="qwiz-score flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
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
      <div class="qwiz-progressbar h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
        <div
          class="qwiz-progressbar-fill h-full bg-accent transition-all"
          style={`width: ${((currentIndex + (locksAnswerImmediately && locked ? 1 : 0)) / run.length) * 100}%`}
        ></div>
      </div>
    </div>

    <div class="qwiz-card space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6">
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
              class="qwiz-submit rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-strong"
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

<!-- A run in progress is unsaved by construction — see LeaveGuard for what it intercepts. Not
     before Start either: a player still reading the rules has entered nothing to lose, so warning
     them would be asking about progress that doesn't exist. -->
<LeaveGuard
  active={started && !finished}
  title="Leave this quiz?"
  message="Your progress on this run won't be saved. Are you sure you want to leave?"
/>
