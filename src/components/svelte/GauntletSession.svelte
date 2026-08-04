<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { Loader2, Swords, Trophy } from '@lucide/svelte';
  import {
    drawQuestions,
    gauntletCategories,
    gauntletScore,
    gauntletWon,
    questionKey,
    questionsPerPick,
    totalRounds,
    hasQuestionsLeft,
    type GauntletCategory,
    type RoundScore
  } from '@/lib/utils/gauntlet';
  import { blankDraft, gradeDraft, canSubmitDraft, type QuestionDraft } from '@/lib/utils/grading';
  import { resolveQuestionSettings } from '@/lib/utils/quizScript';
  import type { QuizScriptQuestion } from '@/lib/utils/quizScript';
  import type { QuizGroup } from '@/lib/utils/quizGroup';
  import QuestionPlayer from './QuestionPlayer.svelte';
  import Button from './Button.svelte';
  import LeaveGuard from './LeaveGuard.svelte';

  // The one mode that isn't a quiz wearing a different hat: it draws questions ACROSS quizzes
  // mid-run, so it can't be a synthesised document QuizPlayer runs. Every DECISION it makes lives
  // in `lib/utils/gauntlet.ts` — this owns the screen and the run state, nothing else.
  let {
    group,
    base,
    questionsByEntry,
    onExit
  }: {
    group: QuizGroup;
    base: string;
    /** Parsed questions per entry id, already fetched. Keyed by entry rather than flattened so a
     * draw can name where a question came from and never repeat it. */
    questionsByEntry: Record<string, QuizScriptQuestion[]>;
    onExit: () => void;
  } = $props();

  const categories = $derived(gauntletCategories(group, base));
  const perPick = $derived(questionsPerPick(group));
  const rounds = $derived(totalRounds(group));
  const available = $derived(
    new Map(Object.entries(questionsByEntry).map(([id, questions]) => [id, questions.length]))
  );

  type Phase = 'choosing' | 'answering' | 'finished';

  let phase = $state<Phase>('choosing');
  let round = $state(1);
  let scores = $state<RoundScore[]>([]);
  // SvelteSet because this is mutated in place as questions are consumed, and a plain Set held in
  // $state isn't reactive on mutation — `exhausted` and the per-category counts both read it.
  const used = new SvelteSet<string>();
  let currentCategory = $state('');
  let queue = $state<{ entryId: string; index: number }[]>([]);
  let queueIndex = $state(0);
  let draft = $state<QuestionDraft>(blankDraft());
  let locked = $state(false);
  let roundEarned = $state(0);
  let roundMax = $state(0);

  const current = $derived.by(() => {
    const slot = queue[queueIndex];
    if (!slot) return null;
    const question = questionsByEntry[slot.entryId]?.[slot.index];
    if (!question) return null;
    // Quiz-wide settings still have to reach a question lifted out of its own document — the same
    // inheritance the ordinary player applies via buildPlayRun. The group's frontmatter stands in
    // for the quiz's here, which is what lets a manifest set the rules for a whole gauntlet.
    return {
      ...question,
      settings: resolveQuestionSettings(question, group.settings)
    };
  });

  const summary = $derived(gauntletScore(scores));
  const exhausted = $derived(!hasQuestionsLeft(categories, available, used));

  function pickCategory(category: GauntletCategory) {
    const drawn = drawQuestions(category, available, used, perPick);
    if (drawn.length === 0) {
      // Nothing left in this category — the run ends rather than offering an empty round.
      phase = 'finished';
      return;
    }
    currentCategory = category.name;
    queue = drawn;
    queueIndex = 0;
    roundEarned = 0;
    roundMax = 0;
    draft = blankDraft();
    locked = false;
    phase = 'answering';
  }

  function submit() {
    if (!current || locked) return;
    // `gradeDraft` returns `{ result, answer }` — the answer record is what a review screen would
    // replay, which a gauntlet doesn't have, so only the score is kept.
    const { result } = gradeDraft(current, draft);
    roundEarned += result.earned;
    roundMax += result.max;

    const slot = queue[queueIndex];
    used.add(questionKey(slot.entryId, slot.index));
    locked = true;
  }

  function next() {
    if (queueIndex < queue.length - 1) {
      queueIndex += 1;
      draft = blankDraft();
      locked = false;
      return;
    }

    scores = [...scores, { category: currentCategory, earned: roundEarned, max: roundMax }];

    // A run stops at `rounds`, or earlier if the group has simply run out of questions — looping
    // over an exhausted pool would either repeat questions or hang.
    if (round >= rounds || exhausted) {
      phase = 'finished';
      return;
    }
    round += 1;
    phase = 'choosing';
  }

  function playAgain() {
    phase = 'choosing';
    round = 1;
    scores = [];
    used.clear();
    queue = [];
    queueIndex = 0;
    roundEarned = 0;
    roundMax = 0;
  }

  function categoryCount(category: GauntletCategory): number {
    return category.entries.reduce((sum, entry) => {
      const total = available.get(entry.id) ?? 0;
      let left = 0;
      for (let i = 0; i < total; i += 1) if (!used.has(questionKey(entry.id, i))) left += 1;
      return sum + left;
    }, 0);
  }
</script>

{#if phase === 'finished'}
  <div class="space-y-4 rounded-lg border border-line-subtle bg-surface-raised p-6 text-center">
    <Trophy
      size={28}
      class="mx-auto {gauntletWon(group, summary.percentage)
        ? 'text-positive-ink'
        : 'text-ink-faint'}"
    />
    <h1 class="text-xl font-bold text-ink">
      {gauntletWon(group, summary.percentage) ? 'Gauntlet cleared!' : 'Gauntlet over'}
    </h1>
    <p class="text-sm text-ink-subtle">
      {Math.round(summary.percentage)}% average across {summary.rounds} round{summary.rounds === 1
        ? ''
        : 's'}
    </p>
    <ul class="mx-auto max-w-sm space-y-1 text-left text-sm">
      {#each scores as score, i (`${score.category}-${i}`)}
        <li class="flex items-baseline justify-between gap-3 border-b border-line-faint py-1">
          <span class="truncate text-ink-muted">Round {i + 1} · {score.category}</span>
          <span class="shrink-0 font-medium text-ink">{score.earned} / {score.max}</span>
        </li>
      {/each}
    </ul>
    <div class="flex flex-wrap items-center justify-center gap-3 pt-2">
      <button
        type="button"
        class="rounded-md border border-line bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface"
        onclick={onExit}
      >
        Back to the group
      </button>
      <button
        type="button"
        class="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink-inverse hover:bg-accent-hover"
        onclick={playAgain}
      >
        Run it again
      </button>
    </div>
  </div>
{:else if phase === 'choosing'}
  <div class="space-y-4">
    <div class="space-y-1 text-center">
      <p class="text-xs font-medium uppercase tracking-wide text-ink-subtle">
        Round {round} of {rounds}
      </p>
      <h1 class="text-xl font-bold text-ink">Pick a category</h1>
      <p class="text-sm text-ink-subtle">
        {perPick} question{perPick === 1 ? '' : 's'} from whichever you choose.
      </p>
    </div>
    <ul class="grid gap-2 sm:grid-cols-2">
      {#each categories as category (category.name)}
        {@const left = categoryCount(category)}
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-2.5 rounded-lg border border-line-subtle bg-surface-raised p-3 text-left transition-colors hover:border-line-strong hover:bg-surface-hover disabled:opacity-50"
            disabled={left === 0}
            onclick={() => pickCategory(category)}
          >
            <Swords size={16} class="shrink-0 text-ink-faint" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium text-ink">{category.name}</span>
              <span class="block text-xs text-ink-subtle">
                {left} question{left === 1 ? '' : 's'} left
              </span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
    {#if scores.length > 0}
      <p class="text-center text-xs text-ink-subtle">
        Averaging {Math.round(summary.percentage)}% so far
      </p>
    {/if}
  </div>
{:else if current}
  <div class="space-y-4">
    <div class="flex items-baseline justify-between gap-3">
      <p class="text-xs font-medium text-ink-subtle">
        Round {round} of {rounds} · {currentCategory}
      </p>
      <p class="text-xs font-medium text-ink-subtle">
        Question {queueIndex + 1} of {queue.length}
      </p>
    </div>

    <!-- Keyed so each drawn question gets a fresh QuestionPlayer: it owns its own draft after
         mount and never re-reads the prop, exactly as QuizPlayer documents. Deliberately NOT
         `standalone` — that mode gives QuestionPlayer its own Submit/Try-again cycle for the
         in-editor tester, and this session drives submission itself. Passing both puts two
         identical Submit buttons on screen. -->
    {#key `${queueIndex}-${round}`}
      <QuestionPlayer
        question={current}
        {draft}
        {locked}
        revealAnswers={locked}
        revealScores={locked}
        onDraftChange={(next) => (draft = next)}
      />
    {/key}

    <div class="flex justify-end">
      {#if locked}
        <Button variant="primary" onclick={next}>
          {queueIndex < queue.length - 1
            ? 'Next question'
            : round >= rounds || exhausted
              ? 'See results'
              : 'Pick again'}
        </Button>
      {:else}
        <Button variant="primary" disabled={!canSubmitDraft(current, draft)} onclick={submit}>
          Submit answer
        </Button>
      {/if}
    </div>
  </div>
{:else}
  <p
    class="flex items-center justify-center gap-2 rounded-lg border border-line-subtle p-6 text-sm text-ink-subtle"
  >
    <Loader2 size={16} class="animate-spin" /> Drawing a question…
  </p>
{/if}

<LeaveGuard
  active={phase !== 'finished' && (scores.length > 0 || phase === 'answering')}
  title="Leave this gauntlet?"
  message="Your progress on this run won't be saved. Are you sure you want to leave?"
/>
