<script lang="ts">
  import { untrack } from 'svelte';
  import type { Component } from 'svelte';
  import { Heart, X, Shuffle, Trophy, Timer, Clock, Ban, Lock, Eye, EyeOff, Sparkles, ScrollText } from '@lucide/svelte';
  import { defaultTriviaSettings, FONT_STACKS, type QuestionInstance, type Trivia } from '../types';
  import { getQuestionType } from '../question-types/registry';
  import { shuffledArray } from '../shuffle';
  import { recordScore } from '../bestScore';

  let { trivia }: { trivia: Trivia } = $props();

  function prepareQuestions(): QuestionInstance[] {
    let qs = trivia.questions;
    if (trivia.settings.shuffleQuestions) {
      qs = shuffledArray(qs);
      // maxQuestions only applies alongside shuffling — sampling a subset without shuffling
      // first would just be "the first N questions" every time, not a random pool draw.
      const max = trivia.settings.maxQuestions;
      if (max != null && max > 0 && max < qs.length) qs = qs.slice(0, max);
    }
    // Each question decides for itself whether its own options get shuffled.
    qs = qs.map((q) => {
      const def = getQuestionType(q.type);
      return def.shuffleOptions ? { ...q, data: def.shuffleOptions(q.data) } : q;
    });
    return qs;
  }

  // Merged with defaults so a trivia saved before a settings field existed (e.g. the new theme
  // colors) still plays with sensible values instead of leaving CSS vars undefined.
  const settings = untrack(() => ({ ...defaultTriviaSettings(), ...trivia.settings }));

  let orderedQuestions = $state<QuestionInstance[]>(untrack(() => prepareQuestions()));
  let index = $state(0);
  let responses = $state<Record<string, unknown>>({});
  let step = $state<'intro' | 'answering' | 'reveal' | 'finished'>(settings.showIntro ? 'intro' : 'answering');
  let attemptId = $state(0);
  let questionSecondsLeft = $state<number | null>(null);
  let overallSecondsLeft = $state<number | null>(null);
  let bestScoreResult = $state<{ best: number; isNewBest: boolean } | null>(null);
  let chosenMessage = $state('');
  // Which questions have already had their per-question reveal shown — used by
  // disableEditAfterReveal to lock those questions' answers if the player navigates back.
  let revealedQuestionIds = $state(new Set<string>());
  // Counts up on each wrong (graded, zero-or-negative-earned) answer as it's submitted — not
  // derived from `responses`, so going Back and changing an answer doesn't retroactively undo
  // a life already lost.
  let wrongCount = $state(0);

  const current = $derived(orderedQuestions[index]);
  const currentDef = $derived(current ? getQuestionType(current.type) : undefined);
  const currentGrade = $derived(current && currentDef ? currentDef.grade(current.data, responses[current.id]) : null);
  const currentUngraded = $derived(current && currentDef ? (currentDef.isUngraded?.(current.data) ?? false) : false);
  // Types without isAnswerComplete (nothing to gate) are always submittable.
  const currentAnswerComplete = $derived(
    current && currentDef ? (currentDef.isAnswerComplete?.(current.data, responses[current.id]) ?? true) : true
  );
  const isLast = $derived(index === orderedQuestions.length - 1);
  const needsReveal = settings.revealAnswers === 'after-question' || settings.revealScore === 'after-question';
  const livesEnabled = settings.maxWrongAnswers !== null;
  const livesExhausted = $derived(livesEnabled && wrongCount >= (settings.maxWrongAnswers ?? Infinity));
  // The running "earned / max" tally is only shown when enabled and scores are being revealed.
  const scoreShown = settings.showRunningScore && settings.revealScore !== 'never';
  // Flips false -> true exactly once per attempt (when Start is clicked, or immediately if
  // there's no intro) and then stays true — used to gate the overall timer without it
  // resetting on every later answering/reveal/finished transition.
  const hasStarted = $derived(step !== 'intro');

  function setResponse(id: string, response: unknown) {
    responses = { ...responses, [id]: response };
  }

  function startTrivia() {
    step = 'answering';
  }

  function goToNextOrFinish() {
    if (isLast) step = 'finished';
    else {
      index += 1;
      step = 'answering';
    }
  }

  function submitAnswer() {
    // A "wrong" answer only counts against lives if the question was actually graded — an
    // ungraded (practice) question, or one worth 0 points outright, can't cost a life.
    if (current && currentDef && !currentUngraded && currentGrade && currentGrade.max > 0 && currentGrade.earned <= 0) {
      wrongCount += 1;
    }

    if (needsReveal && current) {
      revealedQuestionIds.add(current.id);
      revealedQuestionIds = new Set(revealedQuestionIds);
      step = 'reveal';
    } else if (livesExhausted) {
      finishNow();
    } else {
      goToNextOrFinish();
    }
  }

  function isLocked(questionId: string): boolean {
    return settings.disableEditAfterReveal && revealedQuestionIds.has(questionId);
  }

  function continueAfterReveal() {
    if (livesExhausted) finishNow();
    else goToNextOrFinish();
  }

  function finishNow() {
    step = 'finished';
  }

  function prev() {
    if (index > 0) index -= 1;
  }

  function restart() {
    orderedQuestions = prepareQuestions();
    index = 0;
    responses = {};
    step = settings.showIntro ? 'intro' : 'answering';
    bestScoreResult = null;
    revealedQuestionIds = new Set();
    wrongCount = 0;
    attemptId += 1;
  }

  function pickRandomLine(lines: string[], fallback: string): string {
    const candidates = lines.map((l) => l.trim()).filter(Boolean);
    if (candidates.length === 0) return fallback;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function formatTime(seconds: number): string {
    const clamped = Math.max(0, Math.round(seconds));
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Per-question countdown: active only while answering; restarts whenever the current
  // question (or attempt, on restart) changes; auto-submits when it hits zero.
  $effect(() => {
    const limit = settings.perQuestionTimeLimit;
    const activeStep = step;
    const questionId = current?.id;
    const _attempt = attemptId;
    if (limit == null || activeStep !== 'answering' || !questionId) {
      questionSecondsLeft = null;
      return;
    }
    questionSecondsLeft = limit;
    const interval = setInterval(() => {
      questionSecondsLeft = (questionSecondsLeft ?? 1) - 1;
      if ((questionSecondsLeft ?? 0) <= 0) {
        clearInterval(interval);
        submitAnswer();
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  // Overall countdown: starts once per attempt (gated by hasStarted, not raw `step`, so it
  // isn't reset by every later step transition), keeps running through reveal interstitials,
  // jumps straight to the results screen when it hits zero.
  $effect(() => {
    const limit = settings.overallTimeLimit;
    const _attempt = attemptId;
    const started = hasStarted;
    if (limit == null || !started) {
      overallSecondsLeft = null;
      return;
    }
    overallSecondsLeft = limit;
    const interval = setInterval(() => {
      if (step === 'finished') {
        clearInterval(interval);
        return;
      }
      overallSecondsLeft = (overallSecondsLeft ?? 1) - 1;
      if ((overallSecondsLeft ?? 0) <= 0) {
        clearInterval(interval);
        finishNow();
      }
    }, 1000);
    return () => clearInterval(interval);
  });

  const results = $derived(
    orderedQuestions.map((q) => {
      const def = getQuestionType(q.type);
      return {
        question: q,
        def,
        grade: def.grade(q.data, responses[q.id]),
        ungraded: def.isUngraded?.(q.data) ?? false
      };
    })
  );
  const totalEarned = $derived(results.reduce((sum, r) => sum + r.grade.earned, 0));
  const totalMax = $derived(results.reduce((sum, r) => sum + r.grade.max, 0));
  // Only counts questions already submitted (before the current one), not the in-progress one.
  const pointsSoFar = $derived(
    results.slice(0, index).reduce(
      (acc, r) => ({ earned: acc.earned + r.grade.earned, max: acc.max + r.grade.max }),
      { earned: 0, max: 0 }
    )
  );
  const hasWinCondition = settings.pointsToWinPercent !== null;
  // Computed from this attempt's actual total, not a fixed points value — the total can vary
  // between attempts when maxQuestions samples a random subset of the question pool.
  const pointsToWin = $derived(
    hasWinCondition ? Math.round(((settings.pointsToWinPercent ?? 0) / 100) * totalMax) : null
  );
  // Running out of lives is an automatic fail regardless of points earned.
  const won = $derived(!livesExhausted && hasWinCondition && totalEarned >= (pointsToWin ?? 0));

  // The intro screen's "house rules" — one short, playful line per setting that actually
  // changes how you play, built fresh from this trivia's config so it always matches reality.
  const rules = $derived.by(() => {
    const r: { icon: Component; text: string }[] = [];
    const q = orderedQuestions.length;
    const pool = trivia.questions.length;

    if (settings.shuffleQuestions && settings.maxQuestions != null && settings.maxQuestions < pool) {
      r.push({ icon: Shuffle, text: `A random ${q} drawn from a pool of ${pool} — no two runs play out the same.` });
    } else if (settings.shuffleQuestions) {
      r.push({ icon: Shuffle, text: `Questions come shuffled, so memorizing the order won't save you.` });
    }

    if (hasWinCondition) {
      r.push({ icon: Trophy, text: `Bag ${pointsToWin} of ${totalMax} pts (${settings.pointsToWinPercent}%) and the win is yours.` });
    }

    if (livesEnabled) {
      const n = settings.maxWrongAnswers ?? 0;
      r.push({ icon: Heart, text: `You've got ${n} li${n === 1 ? 'fe' : 'ves'} — slip up ${n} time${n === 1 ? '' : 's'} and the run ends on the spot.` });
    }

    if (settings.perQuestionTimeLimit) {
      r.push({ icon: Timer, text: `${settings.perQuestionTimeLimit}s on each question. Blink and it's gone.` });
    }
    if (settings.overallTimeLimit) {
      r.push({ icon: Clock, text: `${formatTime(settings.overallTimeLimit)} on the clock, start to finish.` });
    }

    if (settings.disableBack) {
      r.push({ icon: Ban, text: `No do-overs — once you move on, that question's sealed for good.` });
    } else if (settings.disableEditAfterReveal) {
      r.push({ icon: Lock, text: `Peek at how a question scored and your answer locks — commit before you look.` });
    }

    if (settings.revealAnswers === 'after-question') {
      r.push({ icon: Eye, text: `You'll see how you did right after every question.` });
    } else if (settings.revealAnswers === 'end') {
      r.push({ icon: EyeOff, text: `Answers stay under wraps until the finish line — no peeking.` });
    } else {
      r.push({ icon: EyeOff, text: `Answers never show. Trust your gut and keep moving.` });
    }

    if (results.some((x) => x.ungraded)) {
      r.push({ icon: Sparkles, text: `A few questions are just for fun — they won't dent your score.` });
    }

    return r;
  });

  // Finalizes the attempt once per finish (reruns each time a "Play again" reaches 'finished'
  // again, since `step` genuinely changes value on each transition): records the score and
  // picks the win/lose message once so it doesn't change on every re-render.
  $effect(() => {
    if (step !== 'finished') {
      bestScoreResult = null;
      return;
    }
    if (settings.revealScore !== 'never') {
      bestScoreResult = recordScore(trivia.id, totalEarned);
    }
    if (hasWinCondition && settings.revealWin === 'end') {
      chosenMessage = won
        ? pickRandomLine(settings.winMessage, 'You win!')
        : pickRandomLine(settings.loseMessage, 'Try again!');
    }
  });
</script>

<div
  style={`--color-primary:${settings.primaryColor};--color-secondary:${settings.secondaryColor};--accent:${settings.accentColor};--color-correct:${settings.correctColor};--color-wrong:${settings.wrongColor};--color-partial:${settings.partialColor};--color-neutral:${settings.neutralColor};--color-text:${settings.textColor};--color-bg:${settings.bgColor};color:var(--color-text);font-family:${FONT_STACKS[settings.fontFamily ?? 'sans']}`}
>
  {#if orderedQuestions.length === 0}
    <p class="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
      This trivia has no questions yet.
    </p>
  {:else if step === 'intro'}
    <div class="space-y-6">
      <div class="rounded-lg border border-slate-200 bg-[var(--color-bg)] p-6 sm:p-8">
        {#if trivia.description}
          <p class="text-center text-slate-600">{trivia.description}</p>
        {/if}
        <p class="mt-1 text-center text-lg font-semibold">
          {orderedQuestions.length} question{orderedQuestions.length === 1 ? '' : 's'}{totalMax > 0
            ? `, ${totalMax} points on the line`
            : ''}.
        </p>

        <div class="mt-6 border-t border-slate-100 pt-5">
          <p class="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            <ScrollText size={13} /> House rules
          </p>
          <ul class="space-y-2.5 text-sm text-slate-600">
            {#each rules as rule (rule.text)}
              <li class="flex items-start gap-2.5">
                <rule.icon size={16} class="mt-0.5 shrink-0 text-[var(--accent)]" />
                <span>{rule.text}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
      <div class="text-center">
        <button
          type="button"
          class="rounded-md bg-[var(--color-primary)] px-8 py-2.5 text-sm font-semibold text-white hover:brightness-90"
          onclick={startTrivia}
        >
          Start playing
        </button>
      </div>
    </div>
  {:else if step === 'finished'}
    <div class="space-y-6">
      {#if settings.revealScore !== 'never'}
        <div class="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-6 text-center">
          <p class="text-sm font-medium text-[var(--accent)]">Your score</p>
          <p class="text-3xl font-bold">
            {totalMax > 0 ? `${totalEarned} / ${totalMax} pts` : 'Complete'}
          </p>
          {#if bestScoreResult}
            <p class="mt-1 text-xs font-medium text-slate-500">
              {bestScoreResult.isNewBest ? 'New best!' : `Best: ${bestScoreResult.best} pts`}
            </p>
          {/if}
        </div>
      {:else}
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <p class="text-lg font-semibold">Trivia complete!</p>
        </div>
      {/if}

      {#if livesExhausted}
        <div class="rounded-lg border border-[var(--color-wrong)]/40 bg-[var(--color-wrong)]/10 p-4 text-center">
          <p class="text-lg font-semibold text-[var(--color-wrong)]">
            Out of lives — {wrongCount} wrong answer{wrongCount === 1 ? '' : 's'}
          </p>
        </div>
      {/if}

      {#if hasWinCondition && settings.revealWin === 'end'}
        <div
          class="rounded-lg border p-4 text-center {won
            ? 'border-[var(--color-correct)]/40 bg-[var(--color-correct)]/10'
            : 'border-[var(--color-wrong)]/40 bg-[var(--color-wrong)]/10'}"
        >
          <p class="text-lg font-semibold {won ? 'text-[var(--color-correct)]' : 'text-[var(--color-wrong)]'}">
            {chosenMessage}
          </p>
        </div>
      {/if}

      {#if settings.revealAnswers !== 'never' || settings.revealScore !== 'never'}
        <div class="space-y-3">
          {#each results as r, i (r.question.id)}
            <div
              class="rounded-md border p-3 {r.ungraded
                ? 'border-slate-200 bg-slate-100'
                : r.grade.max === 0
                  ? 'border-[var(--color-neutral)]/30'
                  : r.grade.earned >= r.grade.max
                    ? 'border-[var(--color-correct)]/40 bg-[var(--color-correct)]/10'
                    : r.grade.earned > 0
                      ? 'border-[var(--color-partial)]/40 bg-[var(--color-partial)]/10'
                      : 'border-[var(--color-wrong)]/40 bg-[var(--color-wrong)]/10'}"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm">Question {i + 1}</span>
                {#if settings.revealScore !== 'never'}
                  {#if r.ungraded}
                    <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Not graded</span>
                  {:else if r.grade.max === 0}
                    <span class="text-xs font-medium text-[var(--color-neutral)]">Not scored</span>
                  {:else}
                    <span
                      class="text-xs font-medium {r.grade.earned >= r.grade.max
                        ? 'text-[var(--color-correct)]'
                        : r.grade.earned > 0
                          ? 'text-[var(--color-partial)]'
                          : 'text-[var(--color-wrong)]'}"
                    >
                      {r.grade.earned} / {r.grade.max} pts
                    </span>
                  {/if}
                {/if}
              </div>
              {#if settings.revealAnswers !== 'never' && r.def.AnswerSummary}
                <div class="mt-3">
                  <r.def.AnswerSummary data={r.question.data} response={responses[r.question.id]} />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex justify-center">
        <button
          type="button"
          class="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90"
          onclick={restart}
        >
          Play again
        </button>
      </div>
    </div>
  {:else if step === 'reveal' && current && currentDef}
    <div class="space-y-6">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Question {index + 1} of {orderedQuestions.length}</span>
        {#if currentUngraded}
          <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">Not graded</span>
        {/if}
      </div>

      <div
        class="space-y-4 rounded-lg border p-5 {currentUngraded
          ? 'border-slate-200 bg-slate-100'
          : 'border-slate-200 bg-[var(--color-bg)]'}"
      >
        {#if settings.revealAnswers !== 'never' && currentDef.AnswerSummary}
          <div>
            <p class="mb-2 text-xs font-medium text-slate-500">Review</p>
            <currentDef.AnswerSummary data={current.data} response={responses[current.id]} />
          </div>
        {/if}
        {#if settings.revealScore !== 'never' && currentGrade && !currentUngraded}
          <div class="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3 text-center">
            <p class="text-xs font-medium text-[var(--accent)]">Points earned</p>
            <p class="text-xl font-bold">
              {currentGrade.max > 0 ? `${currentGrade.earned} / ${currentGrade.max} pts` : 'Not scored'}
            </p>
          </div>
        {/if}
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90"
          onclick={continueAfterReveal}
        >
          {isLast ? 'See results' : 'Continue'}
        </button>
      </div>
    </div>
  {:else if current && currentDef}
    {@const locked = isLocked(current.id)}
    <div class="space-y-6">
      <div class="flex items-center justify-between text-xs text-slate-400">
        <span>Question {index + 1} of {orderedQuestions.length}</span>
        <div class="flex items-center gap-3">
          {#if scoreShown}
            <span class="font-semibold text-[var(--accent)]">{pointsSoFar.earned} / {pointsSoFar.max} pts</span>
          {/if}
          {#if livesEnabled}
            {#if scoreShown}
              <span class="h-3.5 w-px bg-slate-300" aria-hidden="true"></span>
            {/if}
            <span class="flex items-center gap-0.5" aria-label={`${(settings.maxWrongAnswers ?? 0) - wrongCount} of ${settings.maxWrongAnswers} lives left`}>
              {#each { length: settings.maxWrongAnswers ?? 0 } as _, i (i)}
                {#if i < wrongCount}
                  <X size={13} class="text-[var(--color-wrong)]" />
                {:else}
                  <Heart size={13} class="text-[var(--color-wrong)]" fill="currentColor" />
                {/if}
              {/each}
            </span>
          {/if}
          {#if overallSecondsLeft !== null}
            <span>Overall {formatTime(overallSecondsLeft)}</span>
          {/if}
          {#if questionSecondsLeft !== null}
            <span
              class="font-medium {questionSecondsLeft <= 5 ? 'text-[var(--color-wrong)]' : ''}"
            >
              {formatTime(questionSecondsLeft)}
            </span>
          {/if}
        </div>
      </div>

      {#if locked}
        <p class="rounded-md border border-[var(--color-partial)]/40 bg-[var(--color-partial)]/10 px-3 py-2 text-xs font-medium text-[var(--color-partial)]">
          You've already seen the result for this question, so it's locked from further changes.
        </p>
      {/if}

      <div
        class="rounded-lg border border-slate-200 bg-[var(--color-bg)] p-5 {locked
          ? 'pointer-events-none opacity-60'
          : ''}"
      >
        {#key current.id}
          <currentDef.Player
            data={current.data}
            response={responses[current.id]}
            onChange={(r: unknown) => (locked ? undefined : setResponse(current.id, r))}
          />
        {/key}
      </div>

      <div class="flex {settings.disableBack ? 'justify-end' : 'justify-between'}">
        {#if !settings.disableBack}
          <button
            type="button"
            class="rounded-md border border-[var(--color-secondary)] px-4 py-2 text-sm font-medium text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={index === 0}
            onclick={prev}
          >
            Back
          </button>
        {/if}
        <button
          type="button"
          class="rounded-md bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!currentAnswerComplete}
          onclick={submitAnswer}
        >
          {isLast ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  {/if}
</div>
