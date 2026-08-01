<script lang="ts">
  import { scale } from 'svelte/transition';
  import { CircleAlert, CircleCheckBig, CircleX } from '@lucide/svelte';
  import { answerVerdict, type QuestionResult } from '@/lib/utils/grading';

  // The banner a question wears once it's been submitted and something about it is being
  // revealed — the one place "how did I do?" is answered, so the run's post-answer screen, the
  // end-of-run Review screen and the editor's own "try it" tester all read identically.
  //
  // `showVerdict` and `showScore` are separate because reveal_answers and reveal_scores are
  // separate quiz settings (see QuizPlayer.svelte): a run can reveal the number without the
  // correctness, in which case this renders as a neutral score readout with no right/wrong
  // language attached to it.
  let {
    result,
    showVerdict,
    showScore
  }: {
    result: QuestionResult;
    showVerdict: boolean;
    showScore: boolean;
  } = $props();

  const verdict = $derived(answerVerdict(result));

  const TONE = {
    correct: {
      label: 'Correct',
      icon: CircleCheckBig,
      box: 'border-positive-line-subtle bg-positive-surface',
      icon_: 'text-positive-ink-soft',
      title: 'text-positive-ink-strong',
      pill: 'bg-positive text-ink-inverse'
    },
    partial: {
      label: 'Partly correct',
      icon: CircleAlert,
      box: 'border-warning-line bg-warning-surface',
      icon_: 'text-warning-ink',
      title: 'text-warning-ink-strong',
      pill: 'bg-warning text-ink-inverse'
    },
    incorrect: {
      label: 'Not quite',
      icon: CircleX,
      box: 'border-negative-line-subtle bg-negative-surface',
      icon_: 'text-negative-ink',
      title: 'text-negative-ink-deep',
      pill: 'bg-negative text-ink-inverse'
    }
  } as const;

  const tone = $derived(TONE[verdict]);
  const Icon = $derived(tone.icon);
</script>

<!-- Same brevity rationale as QuizPlayer's existing `fade`s: 180ms is short enough not to need a
     prefers-reduced-motion fallback of its own. -->
<div
  in:scale={{ duration: 180, start: 0.96 }}
  class="flex items-center gap-3 rounded-lg border p-3 {showVerdict
    ? tone.box
    : 'border-line-subtle bg-surface'}"
  role="status"
>
  {#if showVerdict}
    <Icon size={22} class="shrink-0 {tone.icon_}" />
    <p class="flex-1 text-base font-semibold {tone.title}">{tone.label}</p>
  {:else}
    <p class="flex-1 text-sm font-medium text-ink-soft">Answer submitted</p>
  {/if}

  {#if showScore}
    <span
      class="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold {showVerdict
        ? tone.pill
        : 'bg-surface-inverse text-ink-on-inverse'}"
    >
      {result.earned} / {result.max} points
    </span>
  {/if}
</div>
